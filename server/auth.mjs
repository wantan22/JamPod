// JamPod accounts, sessions, and bands.
//
// - Passwords: scrypt (N=16384, r=8, p=1) with a per-user 16-byte salt.
// - Sessions: 32 random bytes in an HttpOnly cookie; only a SHA-256 hash of
//   the token is stored. 90-day lifetime, renewed on use, so people stay
//   signed in until they log out.
// - Storage: server/store.mjs. Postgres when DATABASE_URL is set (production,
//   e.g. Supabase), else a local JSON file. Reads come from an in-memory copy
//   loaded at boot; every change is written through before we reply.
//   (So run ONE server instance: two would each have their own copy.)
// - CSRF: SameSite=Lax cookie + JSON-only bodies + Origin check on writes.

import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createStore } from './store.mjs';

const scrypt = promisify(scryptCb);

const COOKIE = 'jp_session';
const DAY = 86_400_000;
const SESSION_DAYS = 90;
const RENEW_AFTER = DAY;
const SEATS = ['m1', 'm2', 'm3', 'm4'];
const SEAT_TINTS = { m1: '#E8B464', m2: '#C79BD8', m3: '#7FB7BE', m4: '#E07A5F' };
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const GENDERS = new Set(['masculine', 'feminine', 'nonbinary']);
const TINT_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_BODY = 16 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const newId = (prefix) => `${prefix}-${randomBytes(6).toString('hex')}`;

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isHttps = (req) => Boolean(req.socket?.encrypted) || req.headers['x-forwarded-proto'] === 'https';

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
      return reject(new HttpError(415, 'Expected JSON'));
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createAuth({ dataDir, databaseUrl, log = console.log } = {}) {
  const store = createStore({ dataDir, databaseUrl });

  /** @type {{ users: Record<string, any>, sessions: Record<string, any>, bands: Record<string, any> }} */
  let db = { users: {}, sessions: {}, bands: {} };
  const ready = store.load().then(
    (loaded) => {
      db = loaded;
      const now = Date.now();
      for (const [k, s] of Object.entries(db.sessions)) if (s.expiresAt < now) delete db.sessions[k];
      log(`[auth] ${store.kind} store ready (${store.describe()}): ${Object.keys(db.users).length} users, ${Object.keys(db.bands).length} bands`);
    },
    (e) => {
      log(`[auth] could not load ${store.kind} store: ${e.message}`);
      throw e;
    },
  );
  ready.catch(() => undefined); // surfaced per-request as 503

  const userByEmail = (email) => Object.values(db.users).find((u) => u.email === email);

  /* ---------- rate limiting (in memory) ---------- */
  const buckets = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < now) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return;
    }
    if (++b.count > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  };
  const ip = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

  /* ---------- passwords ---------- */
  const hashPassword = async (password, salt = randomBytes(16).toString('hex')) => ({
    salt,
    hash: (await scrypt(password, salt, 64)).toString('hex'),
  });
  const DUMMY = { salt: '00'.repeat(16), hash: '00'.repeat(64) };
  const verifyPassword = async (password, rec) => {
    const { hash } = await hashPassword(password, rec.salt);
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
  };

  /* ---------- sessions ---------- */
  const cookie = (req, token, maxAgeSec) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;

  const startSession = async (req, res, userId) => {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const key = sha256(token);
    const session = { userId, createdAt: now, renewedAt: now, expiresAt: now + SESSION_DAYS * DAY };
    db.sessions[key] = session;
    await store.putSession(key, session);
    res.setHeader('Set-Cookie', cookie(req, token, SESSION_DAYS * 86400));
  };

  /** Resolve the signed-in user from the cookie (or null). */
  function sessionFor(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const key = sha256(token);
    const s = db.sessions[key];
    if (!s || s.expiresAt < Date.now()) return null;
    const user = db.users[s.userId];
    return user ? { key, token, session: s, user } : null;
  }

  /* ---------- views ---------- */
  const publicUser = (u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    gender: u.profile.gender,
    tint: u.profile.tint,
  });

  const bandView = (b, userId) => ({
    id: b.id,
    name: b.name,
    inviteCode: b.code,
    createdAt: b.createdAt,
    seat: b.members.find((m) => m.userId === userId)?.seat ?? null,
    members: b.members
      .map((m) => {
        const u = db.users[m.userId];
        return u && { seat: m.seat, userId: u.id, displayName: u.displayName, gender: u.profile.gender, tint: u.profile.tint };
      })
      .filter(Boolean),
  });

  const myBands = (userId) =>
    Object.values(db.bands)
      .filter((b) => b.members.some((m) => m.userId === userId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => bandView(b, userId));

  const mePayload = (user) => ({ user: publicUser(user), bands: myBands(user.id) });

  /* ---------- validation ---------- */
  const cleanName = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const cleanEmail = (s) => String(s ?? '').trim().toLowerCase();

  /* ---------- route handlers ---------- */
  const routes = {
    'GET /api/me': async (req, res) => {
      const s = sessionFor(req);
      if (!s) throw new HttpError(401, 'Not signed in');
      if (Date.now() - s.session.renewedAt > RENEW_AFTER) {
        s.session.renewedAt = Date.now();
        s.session.expiresAt = Date.now() + SESSION_DAYS * DAY;
        store.putSession(s.key, s.session).catch((e) => log(`[auth] session renew failed: ${e.message}`));
        res.setHeader('Set-Cookie', cookie(req, s.token, SESSION_DAYS * 86400));
      }
      return mePayload(s.user);
    },

    'POST /api/register': async (req, res, body) => {
      limit(`register:${ip(req)}`, 20, 60 * 60_000);
      const email = cleanEmail(body.email);
      const displayName = cleanName(body.displayName, 16);
      const password = String(body.password ?? '');
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
      if (!displayName) throw new HttpError(400, 'Please choose a display name.');
      if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
      if (password.length > 200) throw new HttpError(400, 'Password is too long.');
      if (userByEmail(email)) throw new HttpError(409, 'That email already has an account. Try logging in.');
      const user = {
        id: newId('user'),
        email,
        displayName,
        password: await hashPassword(password),
        profile: { gender: 'nonbinary', tint: '#E8B464' },
        createdAt: Date.now(),
      };
      db.users[user.id] = user;
      try {
        await store.putUser(user); // Postgres rejects a duplicate email from a parallel request
      } catch (e) {
        delete db.users[user.id];
        throw e;
      }
      await startSession(req, res, user.id);
      log(`[auth] registered ${email}`);
      return mePayload(user);
    },

    'POST /api/login': async (req, res, body) => {
      const email = cleanEmail(body.email);
      limit(`login:${ip(req)}:${email}`, 10, 10 * 60_000);
      const user = userByEmail(email);
      const ok = await verifyPassword(String(body.password ?? ''), user?.password ?? DUMMY);
      if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');
      await startSession(req, res, user.id);
      return mePayload(user);
    },

    'POST /api/logout': async (req, res) => {
      const s = sessionFor(req);
      if (s) {
        delete db.sessions[s.key];
        await store.deleteSession(s.key);
      }
      res.setHeader('Set-Cookie', cookie(req, '', 0));
      return { ok: true };
    },

    'PATCH /api/me': async (req, _res, body) => {
      const s = sessionFor(req);
      if (!s) throw new HttpError(401, 'Not signed in');
      if (body.displayName !== undefined) {
        const name = cleanName(body.displayName, 16);
        if (!name) throw new HttpError(400, 'Display name cannot be empty.');
        s.user.displayName = name;
      }
      if (body.gender !== undefined) {
        if (!GENDERS.has(body.gender)) throw new HttpError(400, 'Unknown character style.');
        s.user.profile.gender = body.gender;
      }
      if (body.tint !== undefined) {
        if (!TINT_RE.test(body.tint)) throw new HttpError(400, 'Invalid colour.');
        s.user.profile.tint = body.tint;
      }
      await store.putUser(s.user);
      return mePayload(s.user);
    },

    'POST /api/bands': async (req, _res, body) => {
      const s = sessionFor(req);
      if (!s) throw new HttpError(401, 'Not signed in');
      const name = cleanName(body.name, 40);
      if (!name) throw new HttpError(400, 'Give your band a name.');
      if (myBands(s.user.id).length >= 20) throw new HttpError(400, 'You can be in up to 20 bands.');
      let code;
      do code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      while (Object.values(db.bands).some((b) => b.code === code));
      const band = {
        id: newId('band'),
        name,
        code,
        createdAt: Date.now(),
        createdBy: s.user.id,
        members: [{ userId: s.user.id, seat: 'm1', joinedAt: Date.now() }],
      };
      db.bands[band.id] = band;
      try {
        await store.putBand(band);
      } catch (e) {
        delete db.bands[band.id];
        throw e;
      }
      return { band: bandView(band, s.user.id), ...mePayload(s.user) };
    },

    'POST /api/bands/join': async (req, _res, body) => {
      const s = sessionFor(req);
      if (!s) throw new HttpError(401, 'Not signed in');
      limit(`join:${s.user.id}`, 30, 10 * 60_000);
      const code = String(body.code ?? '').trim().toUpperCase();
      const band = Object.values(db.bands).find((b) => b.code === code);
      if (!band) throw new HttpError(404, 'No band found with that invite code.');
      if (!band.members.some((m) => m.userId === s.user.id)) {
        const free = SEATS.find((seat) => !band.members.some((m) => m.seat === seat));
        if (!free) throw new HttpError(409, `${band.name} already has 4 members (one per stage station).`);
        band.members.push({ userId: s.user.id, seat: free, joinedAt: Date.now() });
        await store.putBand(band);
        if (s.user.profile.tint === '#E8B464') {
          s.user.profile.tint = SEAT_TINTS[free];
          await store.putUser(s.user);
        }
      }
      return { band: bandView(band, s.user.id), ...mePayload(s.user) };
    },

    'POST /api/bands/leave': async (req, _res, body) => {
      const s = sessionFor(req);
      if (!s) throw new HttpError(401, 'Not signed in');
      const band = db.bands[String(body.bandId ?? '')];
      if (band) {
        band.members = band.members.filter((m) => m.userId !== s.user.id);
        if (band.members.length === 0) {
          delete db.bands[band.id];
          await store.deleteBand(band.id);
        } else {
          await store.putBand(band);
        }
      }
      return mePayload(s.user);
    },
  };

  /** Handles /api/* requests. Resolves true if the request was ours. */
  async function handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://jampod.local');
    if (!url.pathname.startsWith('/api/')) return false;
    const handler = routes[`${req.method} ${url.pathname}`];
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    try {
      await ready.catch(() => {
        throw new HttpError(503, 'The account database is unavailable right now. Please try again shortly.');
      });
      if (!handler) throw new HttpError(404, 'Not found');
      let body = {};
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-site request blocked');
        body = await readJson(req);
      }
      send(200, await handler(req, res, body));
    } catch (err) {
      // Postgres unique violation (e.g. two sign-ups racing for one email).
      const e = err?.code === '23505' ? new HttpError(409, 'That already exists. Please try again or log in.') : err;
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log(`[auth] error: ${e?.stack ?? e}`);
      send(status, { error: status === 500 ? 'Something went wrong on the server.' : e.message });
    }
    return true;
  }

  /** Relay gate: only signed-in members of a band may join its room. */
  function canJoinRoom(req, room) {
    const s = sessionFor(req);
    return Boolean(s && db.bands[room]?.members.some((m) => m.userId === s.user.id));
  }

  return { handleHttp, canJoinRoom };
}
