// Persistence for accounts, sessions, and bands.
//
// auth.mjs keeps everything in memory for fast, synchronous reads (the
// WebSocket gate needs a sync answer) and calls these write-through
// operations on every change. Two adapters share one interface:
//
//   createJsonStore(dir)  local dev: one JSON file (git-ignored)
//   createPgStore(url)    production: Postgres (e.g. Supabase), via DATABASE_URL
//
// In-memory shapes (all times are epoch ms):
//   user    { id, email, displayName, password: { salt, hash }, profile: { gender, tint }, createdAt }
//   session { userId, createdAt, renewedAt, expiresAt }   keyed by SHA-256(token)
//   band    { id, name, code, createdAt, createdBy, members: [{ userId, seat, joinedAt }] }

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/* ---------------------------------------------------------------- JSON */

export function createJsonStore(dataDir) {
  const file = path.join(dataDir, 'jampod-db.json');
  let db = { version: 1, users: {}, sessions: {}, bands: {} };

  const flush = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, file);
  };

  return {
    kind: 'json',
    describe: () => file,
    async load() {
      try {
        db = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        /* first run */
      }
      return db;
    },
    // The JSON adapter shares the live object, so every write is just a flush.
    putUser: async () => flush(),
    putSession: async () => flush(),
    deleteSession: async () => flush(),
    putBand: async () => flush(),
    deleteBand: async () => flush(),
  };
}

/* ------------------------------------------------------------ Postgres */

const ms = (d) => new Date(d).getTime();
const ts = (n) => new Date(n).toISOString();

export function createPgStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 30_000,
    // Supabase requires TLS. Its certificates chain to Supabase's own CA,
    // which Node doesn't ship, so we encrypt without CA pinning.
    ssl: { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('[db] idle client error', e.message));

  return {
    kind: 'postgres',
    describe: () => {
      const u = new URL(connectionString);
      return `postgres://${u.username}@${u.host}${u.pathname}`;
    },

    async load() {
      const [users, sessions, bands, members] = await Promise.all([
        pool.query('select * from users'),
        pool.query('select * from sessions where expires_at > now()'),
        pool.query('select * from bands'),
        pool.query('select * from band_members order by joined_at'),
      ]);
      const db = { users: {}, sessions: {}, bands: {} };
      for (const u of users.rows) {
        db.users[u.id] = {
          id: u.id,
          email: u.email,
          displayName: u.display_name,
          password: { salt: u.password_salt, hash: u.password_hash },
          profile: { gender: u.gender, tint: u.tint },
          createdAt: ms(u.created_at),
        };
      }
      for (const s of sessions.rows) {
        db.sessions[s.token_hash] = {
          userId: s.user_id,
          createdAt: ms(s.created_at),
          renewedAt: ms(s.renewed_at),
          expiresAt: ms(s.expires_at),
        };
      }
      for (const b of bands.rows) {
        db.bands[b.id] = { id: b.id, name: b.name, code: b.invite_code, createdAt: ms(b.created_at), createdBy: b.created_by, members: [] };
      }
      for (const m of members.rows) {
        db.bands[m.band_id]?.members.push({ userId: m.user_id, seat: m.seat, joinedAt: ms(m.joined_at) });
      }
      return db;
    },

    async putUser(u) {
      await pool.query(
        `insert into users (id, email, display_name, password_salt, password_hash, gender, tint, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (id) do update set display_name = excluded.display_name, gender = excluded.gender, tint = excluded.tint`,
        [u.id, u.email, u.displayName, u.password.salt, u.password.hash, u.profile.gender, u.profile.tint, ts(u.createdAt)],
      );
    },

    async putSession(key, s) {
      await pool.query(
        `insert into sessions (token_hash, user_id, created_at, renewed_at, expires_at) values ($1,$2,$3,$4,$5)
         on conflict (token_hash) do update set renewed_at = excluded.renewed_at, expires_at = excluded.expires_at`,
        [key, s.userId, ts(s.createdAt), ts(s.renewedAt), ts(s.expiresAt)],
      );
    },

    async deleteSession(key) {
      await pool.query('delete from sessions where token_hash = $1', [key]);
    },

    /** Upsert a band and make its member rows match `band.members` exactly. */
    async putBand(band) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(
          `insert into bands (id, name, invite_code, created_by, created_at) values ($1,$2,$3,$4,$5)
           on conflict (id) do update set name = excluded.name`,
          [band.id, band.name, band.code, band.createdBy, ts(band.createdAt)],
        );
        const ids = band.members.map((m) => m.userId);
        await client.query('delete from band_members where band_id = $1 and not (user_id = any($2::text[]))', [band.id, ids]);
        for (const m of band.members) {
          await client.query(
            `insert into band_members (band_id, user_id, seat, joined_at) values ($1,$2,$3,$4)
             on conflict (band_id, user_id) do nothing`,
            [band.id, m.userId, m.seat, ts(m.joinedAt)],
          );
        }
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },

    async deleteBand(id) {
      await pool.query('delete from bands where id = $1', [id]);
    },
  };
}

/** DATABASE_URL → Postgres, otherwise the local JSON file. */
export function createStore({ dataDir, databaseUrl = process.env.DATABASE_URL }) {
  return databaseUrl ? createPgStore(databaseUrl) : createJsonStore(dataDir);
}
