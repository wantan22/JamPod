// Persistence for accounts, sessions, password resets, bands, band
// libraries (songs/versions/setlists), and published recordings.
//
// auth.mjs keeps users/sessions/resets/bands in memory for fast, synchronous
// reads (the WebSocket gate needs a sync answer) and writes through on every
// change. Libraries and audio are read on demand.
//
//   createJsonStore(dir)  local dev: a JSON file + an audio/ folder (git-ignored)
//   createPgStore(url)    production: Postgres (e.g. Supabase), via DATABASE_URL
//
// In-memory shapes (times are epoch ms):
//   user    { id, email, displayName, password: { salt, hash }, profile: { gender, tint }, createdAt }
//   session { userId, createdAt, renewedAt, expiresAt }      keyed by SHA-256(token)
//   reset   { userId, createdAt, expiresAt }                 keyed by SHA-256(token)
//   band    { id, name, code, createdAt, createdBy, members: [{ userId, seat, joinedAt }] }
//   library { rev, doc }   (doc is the client's { songs, setlists } JSON)

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/* ---------------------------------------------------------------- JSON */

export function createJsonStore(dataDir) {
  const file = path.join(dataDir, 'jampod-db.json');
  const audioDir = path.join(dataDir, 'audio');
  let db = { version: 2, users: {}, sessions: {}, resets: {}, bands: {}, libraries: {}, audio: {} };

  const flush = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, file);
  };

  return {
    kind: 'json',
    describe: () => file,
    async checkSchema() {
      return [];
    },
    async load() {
      try {
        db = { ...db, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch {
        /* first run */
      }
      db.resets ??= {};
      db.libraries ??= {};
      db.audio ??= {};
      return db;
    },
    // The JSON adapter shares the live object with auth.mjs, so most writes are a flush.
    putUser: async () => flush(),
    putSession: async () => flush(),
    deleteSession: async () => flush(),
    async deleteSessionsForUser(userId, exceptKey) {
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === userId && k !== exceptKey) delete db.sessions[k];
      flush();
    },
    putReset: async () => flush(),
    deleteReset: async () => flush(),
    putBand: async () => flush(),
    async deleteBand(id) {
      delete db.libraries[id];
      for (const [aid, a] of Object.entries(db.audio)) {
        if (a.bandId === id) {
          delete db.audio[aid];
          fs.rmSync(path.join(audioDir, `${aid}.bin`), { force: true });
        }
      }
      flush();
    },

    async getLibrary(bandId) {
      return db.libraries[bandId] ?? null;
    },
    async saveLibrary(bandId, baseRev, doc) {
      const cur = db.libraries[bandId];
      if ((cur?.rev ?? 0) !== baseRev) return { ok: false, rev: cur?.rev ?? 0, doc: cur?.doc ?? null };
      db.libraries[bandId] = { rev: baseRev + 1, doc };
      flush();
      return { ok: true, rev: baseRev + 1 };
    },

    async putAudio({ id, bandId, mime, bytes, createdBy }) {
      fs.mkdirSync(audioDir, { recursive: true });
      fs.writeFileSync(path.join(audioDir, `${id}.bin`), bytes);
      db.audio[id] = { bandId, mime, size: bytes.length, createdBy, createdAt: Date.now() };
      flush();
    },
    async getAudio(id) {
      const meta = db.audio[id];
      if (!meta) return null;
      try {
        return { bandId: meta.bandId, mime: meta.mime, bytes: fs.readFileSync(path.join(audioDir, `${id}.bin`)) };
      } catch {
        return null;
      }
    },
    async bandAudioBytes(bandId) {
      return Object.values(db.audio).reduce((n, a) => n + (a.bandId === bandId ? a.size : 0), 0);
    },
  };
}

/* ------------------------------------------------------------ Postgres */

const ms = (d) => new Date(d).getTime();
const ts = (n) => new Date(n).toISOString();

const REQUIRED_TABLES = ['users', 'sessions', 'bands', 'band_members', 'password_resets', 'band_libraries', 'band_audio'];

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

    /** Names of tables the app needs but the database doesn't have yet. */
    async checkSchema() {
      const { rows } = await pool.query(
        `select t from unnest($1::text[]) as t where to_regclass('public.' || t) is null`,
        [REQUIRED_TABLES],
      );
      return rows.map((r) => r.t);
    },

    async load() {
      const missing = await this.checkSchema();
      const has = (t) => !missing.includes(t);
      const [users, sessions, bands, members, resets] = await Promise.all([
        pool.query('select * from users'),
        pool.query('select * from sessions where expires_at > now()'),
        pool.query('select * from bands'),
        pool.query('select * from band_members order by joined_at'),
        has('password_resets') ? pool.query('select * from password_resets where expires_at > now()') : { rows: [] },
      ]);
      const db = { users: {}, sessions: {}, resets: {}, bands: {} };
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
        db.sessions[s.token_hash] = { userId: s.user_id, createdAt: ms(s.created_at), renewedAt: ms(s.renewed_at), expiresAt: ms(s.expires_at) };
      }
      for (const r of resets.rows) {
        db.resets[r.token_hash] = { userId: r.user_id, createdAt: ms(r.created_at), expiresAt: ms(r.expires_at) };
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
         on conflict (id) do update set display_name = excluded.display_name, gender = excluded.gender, tint = excluded.tint,
           password_salt = excluded.password_salt, password_hash = excluded.password_hash`,
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
    async deleteSessionsForUser(userId, exceptKey) {
      await pool.query('delete from sessions where user_id = $1 and token_hash <> $2', [userId, exceptKey ?? '']);
    },

    async putReset(key, r) {
      await pool.query(
        'insert into password_resets (token_hash, user_id, created_at, expires_at) values ($1,$2,$3,$4)',
        [key, r.userId, ts(r.createdAt), ts(r.expiresAt)],
      );
    },
    async deleteReset(key) {
      await pool.query('delete from password_resets where token_hash = $1', [key]);
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
      await pool.query('delete from bands where id = $1', [id]); // cascades to library + audio
    },

    async getLibrary(bandId) {
      const { rows } = await pool.query('select rev, doc from band_libraries where band_id = $1', [bandId]);
      return rows[0] ? { rev: rows[0].rev, doc: rows[0].doc } : null;
    },
    /** Optimistic concurrency: only writes if the stored rev still equals baseRev. */
    async saveLibrary(bandId, baseRev, doc) {
      const json = JSON.stringify(doc);
      const res =
        baseRev === 0
          ? await pool.query(
              `insert into band_libraries (band_id, rev, doc) values ($1, 1, $2::jsonb)
               on conflict (band_id) do nothing returning rev`,
              [bandId, json],
            )
          : await pool.query(
              `update band_libraries set doc = $3::jsonb, rev = rev + 1, updated_at = now()
               where band_id = $1 and rev = $2 returning rev`,
              [bandId, baseRev, json],
            );
      if (res.rows[0]) return { ok: true, rev: res.rows[0].rev };
      const cur = await this.getLibrary(bandId);
      return { ok: false, rev: cur?.rev ?? 0, doc: cur?.doc ?? null };
    },

    async putAudio({ id, bandId, mime, bytes, createdBy }) {
      await pool.query(
        'insert into band_audio (id, band_id, mime, bytes, size, created_by) values ($1,$2,$3,$4,$5,$6)',
        [id, bandId, mime, bytes, bytes.length, createdBy],
      );
    },
    async getAudio(id) {
      const { rows } = await pool.query('select band_id, mime, bytes from band_audio where id = $1', [id]);
      return rows[0] ? { bandId: rows[0].band_id, mime: rows[0].mime, bytes: rows[0].bytes } : null;
    },
    async bandAudioBytes(bandId) {
      const { rows } = await pool.query('select coalesce(sum(size), 0)::bigint as n from band_audio where band_id = $1', [bandId]);
      return Number(rows[0].n);
    },
  };
}

/** DATABASE_URL → Postgres, otherwise the local JSON file. */
export function createStore({ dataDir, databaseUrl = process.env.DATABASE_URL }) {
  return databaseUrl ? createPgStore(databaseUrl) : createJsonStore(dataDir);
}
