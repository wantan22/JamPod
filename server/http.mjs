// Small HTTP helpers shared by the JamPod API modules.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export const isHttps = (req) => Boolean(req.socket?.encrypted) || req.headers['x-forwarded-proto'] === 'https';

/** Read the whole request body as a Buffer, refusing anything over `limit` bytes. */
export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      reject(new HttpError(413, `That’s too large (max ${Math.round(limit / 1024 / 1024)} MB).`));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `That’s too large (max ${Math.round(limit / 1024 / 1024)} MB).`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Read a JSON body (requires Content-Type: application/json, a CSRF guard). */
export async function readJson(req, limit = 16 * 1024) {
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Expected JSON');
  const buf = await readRaw(req, limit);
  try {
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

/** Public base URL for links in emails. Never trust the Host header in production. */
export function appUrl(req) {
  const configured = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;
}
