// JamPod relay — a tiny room-scoped WebSocket fan-out.
//
// Clients connect to  ws(s)://host/jam?room=<id>  and every text frame they
// send is forwarded verbatim to the *other* clients in the same room. The
// server never parses or stores band state: peers answer each other's
// snapshot requests, so the relay stays stateless and trivially scalable.
//
// Used by server/index.mjs (production) and vite.config.ts (dev), both of
// which pass `authorize` so only signed-in band members can enter a room.
//
// HTTP:  GET /jam/health → room + client counts
//        GET /jam/info   → this machine's LAN addresses (for phone QR links)

import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const ROOM_RE = /^[\w-]{1,64}$/;
const MAX_FRAME_BYTES = 512 * 1024; // chord charts are small; audio never goes through here
const MAX_PEERS_PER_ROOM = 16;
const MAX_MSGS_PER_SEC = 120;
const HEARTBEAT_MS = 15_000;

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

export function createRelay({ path = '/jam', log = console.log, authorize = () => true } = {}) {
  /** @type {Map<string, Set<import('ws').WebSocket>>} */
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  const stats = () => ({
    rooms: rooms.size,
    clients: [...rooms.values()].reduce((n, s) => n + s.size, 0),
  });

  wss.on('connection', (ws, room) => {
    const peers = rooms.get(room) ?? new Set();
    rooms.set(room, peers);
    peers.add(ws);
    ws.isAlive = true;
    ws.budget = { second: 0, count: 0 };
    log(`[relay] +1 #${room} (${peers.size} in room)`);

    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // protocol is JSON text only
      const sec = Math.floor(Date.now() / 1000);
      if (ws.budget.second !== sec) ws.budget = { second: sec, count: 0 };
      if (++ws.budget.count > MAX_MSGS_PER_SEC) return; // drop floods silently
      const text = data.toString();
      for (const peer of peers) {
        if (peer !== ws && peer.readyState === peer.OPEN) peer.send(text);
      }
    });

    ws.on('close', () => {
      peers.delete(ws);
      if (peers.size === 0) rooms.delete(room);
      log(`[relay] -1 #${room} (${peers.size} left)`);
    });
    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  /** Returns true if the request was a relay upgrade (and was handled). */
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url ?? '/', 'http://relay.local');
    if (url.pathname !== path) return false;
    const room = url.searchParams.get('room') ?? '';
    const reject = (code, msg) => {
      socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!ROOM_RE.test(room)) {
      reject(400, 'Bad Room');
      return true;
    }
    if (!authorize(req, room)) {
      reject(401, 'Unauthorized');
      return true;
    }
    if ((rooms.get(room)?.size ?? 0) >= MAX_PEERS_PER_ROOM) {
      reject(429, 'Room Full');
      return true;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, room));
    return true;
  }

  /** Returns true if the request was a relay HTTP endpoint (and was handled). */
  function handleHttp(req, res) {
    const url = new URL(req.url ?? '/', 'http://relay.local');
    const route = url.pathname.endsWith('/health') ? 'health' : url.pathname.endsWith('/info') ? 'info' : null;
    if (!route || !url.pathname.startsWith(path)) return false;
    const body = route === 'health' ? { ok: true, ...stats() } : { lanAddresses: lanAddresses() };
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(body));
    return true;
  }

  function close() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }

  return { handleUpgrade, handleHttp, stats, close };
}
