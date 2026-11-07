// Shared band library (songs, versions, stems metadata, setlists) and
// published recordings. Members of a band only.
//
//   GET  /api/bands/:id/library          → { rev, doc | null }
//   PUT  /api/bands/:id/library          { baseRev, doc } → { rev } | 409 { rev, doc }
//   POST /api/bands/:id/audio            raw audio/* body → { id, url, size }
//   GET  /api/bands/:id/audio/:audioId   → the recording bytes (immutable)
//
// The library is one JSON document per band with a revision number. Clients
// save with the revision they started from; if someone else saved first the
// server answers 409 with the latest copy, and the client re-applies its
// pending edits on top and tries again — so simultaneous edits merge instead
// of overwriting each other.

import { HttpError, readJson, readRaw, sendJson } from './http.mjs';

const MAX_DOC_BYTES = 1024 * 1024; // song metadata only; audio lives elsewhere
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // ~15 min of 128 kbps Opus
const MAX_BAND_AUDIO_BYTES = 200 * 1024 * 1024;
const MIME_RE = /^audio\/[\w.+-]{1,40}(;\s*codecs=[\w.,"-]{1,40})?$/i;
const ROUTE = /^\/api\/bands\/([\w-]{1,64})\/(library|audio)(?:\/([\w-]{1,64}))?$/;

export function createLibraryApi({ store, requireUser, isMember, needTables, newId, log }) {
  async function handle(req, res, url) {
    const m = url.pathname.match(ROUTE);
    if (!m) return false;
    const [, bandId, kind, audioId] = m;

    const s = requireUser(req);
    if (!isMember(s.user.id, bandId)) throw new HttpError(403, 'You’re not a member of this band.');

    if (kind === 'library' && !audioId) {
      needTables('band_libraries');
      if (req.method === 'GET') {
        const lib = await store.getLibrary(bandId);
        sendJson(res, 200, { rev: lib?.rev ?? 0, doc: lib?.doc ?? null });
        return true;
      }
      if (req.method === 'PUT') {
        const body = await readJson(req, MAX_DOC_BYTES);
        const baseRev = Number(body.baseRev);
        const doc = body.doc;
        if (!Number.isInteger(baseRev) || baseRev < 0) throw new HttpError(400, 'Missing baseRev');
        if (!doc || typeof doc !== 'object' || !Array.isArray(doc.songs) || !Array.isArray(doc.setlists)) {
          throw new HttpError(400, 'Library must contain songs and setlists.');
        }
        const result = await store.saveLibrary(bandId, baseRev, { songs: doc.songs, setlists: doc.setlists });
        if (result.ok) sendJson(res, 200, { rev: result.rev });
        else sendJson(res, 409, { error: 'Someone else saved first', rev: result.rev, doc: result.doc });
        return true;
      }
      throw new HttpError(405, 'Method not allowed');
    }

    if (kind === 'audio') {
      needTables('band_audio');
      if (req.method === 'POST' && !audioId) {
        const mime = String(req.headers['content-type'] ?? '').trim();
        if (!MIME_RE.test(mime)) throw new HttpError(415, 'Only audio recordings can be published.');
        const bytes = await readRaw(req, MAX_AUDIO_BYTES);
        if (bytes.length < 100) throw new HttpError(400, 'That recording is empty.');
        if ((await store.bandAudioBytes(bandId)) + bytes.length > MAX_BAND_AUDIO_BYTES) {
          throw new HttpError(413, 'Your band has used its 200 MB of recording space.');
        }
        const id = newId('aud');
        await store.putAudio({ id, bandId, mime, bytes, createdBy: s.user.id });
        log(`[library] ${s.user.email} published ${Math.round(bytes.length / 1024)} KB to ${bandId}`);
        sendJson(res, 200, { id, url: `/api/bands/${bandId}/audio/${id}`, size: bytes.length });
        return true;
      }
      if (req.method === 'GET' && audioId) {
        const audio = await store.getAudio(audioId);
        if (!audio || audio.bandId !== bandId) throw new HttpError(404, 'Recording not found');
        res.writeHead(200, {
          'content-type': audio.mime,
          'content-length': audio.bytes.length,
          'cache-control': 'private, max-age=31536000, immutable',
        });
        res.end(audio.bytes);
        return true;
      }
      throw new HttpError(405, 'Method not allowed');
    }
    return false;
  }

  return { handle };
}
