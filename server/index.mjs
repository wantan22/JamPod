// JamPod production server — one process, one origin:
//   /api/*  accounts, sessions, bands        (server/auth.mjs)
//   /jam    WebSocket relay, members only    (server/relay.mjs)
//   /*      the built frontend from ../dist   (SPA fallback to index.html)
//
//   npm run build && npm start      → http://localhost:8787
//
// Env: PORT (8787), DATABASE_URL (Postgres; if unset, accounts go to
//      JAMPOD_DATA_DIR/jampod-db.json, default ./server/data), STATIC_DIR (../dist)
// Serving the app and API from the same origin keeps the login cookie
// first-party, so it survives browser restarts without CORS or SameSite issues.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.mjs';
import { createRelay, lanAddresses } from './relay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8787;
const dataDir = path.resolve(process.env.JAMPOD_DATA_DIR ?? path.join(here, 'data'));
const staticDir = path.resolve(process.env.STATIC_DIR ?? path.join(here, '..', 'dist'));

const auth = createAuth({ dataDir });
const relay = createRelay({ authorize: auth.canJoinRoom });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = path.resolve(staticDir, `.${urlPath}`);
  if (file !== staticDir && !file.startsWith(staticDir + path.sep)) return res.writeHead(403).end();
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
  } catch {
    file = path.join(staticDir, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const hashed = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Frontend not built yet — run `npm run build`.');
  }
}

const server = createServer(async (req, res) => {
  if (await auth.handleHttp(req, res)) return;
  if (relay.handleHttp(req, res)) return;
  await serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!relay.handleUpgrade(req, socket, head)) socket.destroy();
});

server.listen(port, () => {
  console.log(`[jampod] http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`[jampod] LAN  http://${ip}:${port}`);
});

const shutdown = () => {
  relay.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
