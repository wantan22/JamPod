import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserPreferences, type SharedAction } from '../context/UserPreferencesContext';
import type { ActivityEntry, ImportedMedia, SharedRoomState } from '../types';
import { ROLE_META } from '../types';
import { uid } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Wire protocol                                                      */
/* ------------------------------------------------------------------ */

/** Fire-and-forget messages that are NOT part of the replicated state. */
export type EphemeralMessage =
  | { kind: 'level'; memberId: string; level: number }
  | { kind: 'media'; media: ImportedMedia }
  | { kind: 'transport'; playing: boolean; t: number; at: number }
  | { kind: 'publish'; memberId: string; trackName: string; bytes: number }
  | { kind: 'companion-ping'; memberId: string; micLive: boolean }
  /** A bandmate saved the shared library; refetch if `rev` is newer than ours. */
  | { kind: 'library'; rev: number };

type WireMessage =
  | { type: 'action'; from: string; action: SharedAction }
  | { type: 'sync/request'; from: string; reqId: string }
  | { type: 'sync/snapshot'; from: string; reqId: string; state: SharedRoomState }
  | { type: 'presence'; from: string; memberId: string }
  | { type: 'ping'; from: string; t: number }
  | { type: 'pong'; from: string; to: string; t: number }
  | { type: 'ephemeral'; from: string; payload: EphemeralMessage };

export type TransportKind = 'websocket' | 'broadcast' | 'none';
export type SocketStatus = 'connecting' | 'open' | 'closed';

interface Transport {
  send: (msg: WireMessage) => void;
  close: () => void;
}

interface TransportCallbacks {
  onMessage: (msg: WireMessage) => void;
  onStatus: (s: SocketStatus) => void;
  onKind: (kind: TransportKind, detail: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Transports                                                         */
/*  VITE_JAM_WS_URL decides the route:                                 */
/*    (unset)      → try the same-origin relay at /jam, and fall back  */
/*                   to BroadcastChannel if it never answers            */
/*    /path        → same-origin relay at that path (no fallback)       */
/*    ws(s)://…    → that relay (no fallback)                           */
/*    off          → BroadcastChannel only (tabs of one browser)        */
/* ------------------------------------------------------------------ */

const AUTO_TIMEOUT_MS = 2500;

function resolveRelayUrl(): { url: string | null; auto: boolean } {
  const raw = (import.meta.env.VITE_JAM_WS_URL ?? '').trim();
  if (raw.toLowerCase() === 'off') return { url: null, auto: false };
  const sameOrigin = (path: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
  if (!raw) return { url: sameOrigin('/jam'), auto: true };
  return { url: raw.startsWith('/') ? sameOrigin(raw) : raw, auto: false };
}

function createBroadcastTransport(roomId: string, cb: TransportCallbacks): Transport | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(`jampod:${roomId}`);
  let closed = false;
  channel.onmessage = (ev: MessageEvent<WireMessage>) => cb.onMessage(ev.data);
  queueMicrotask(() => !closed && cb.onStatus('open'));
  return {
    send: (msg) => {
      if (!closed) channel.postMessage(msg);
    },
    close: () => {
      closed = true;
      channel.close();
    },
  };
}

/**
 * WebSocket with exponential-backoff reconnect. In `auto` mode, if the very
 * first connection never opens, `onGiveUp` fires so we can fall back.
 */
function createWebSocketTransport(url: string, roomId: string, cb: TransportCallbacks, onGiveUp?: () => void): Transport {
  let ws: WebSocket | null = null;
  let closed = false;
  let everOpened = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  const queue: WireMessage[] = [];
  const full = `${url}${url.includes('?') ? '&' : '?'}room=${encodeURIComponent(roomId)}`;

  const giveUp = () => {
    if (closed || everOpened || !onGiveUp) return;
    closed = true;
    clearTimeout(timer);
    ws?.close();
    onGiveUp();
  };

  const connect = () => {
    cb.onStatus('connecting');
    ws = new WebSocket(full);
    ws.onopen = () => {
      everOpened = true;
      clearTimeout(giveUpTimer);
      retry = 0;
      cb.onStatus('open');
      while (queue.length && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(queue.shift()));
    };
    ws.onmessage = (ev) => {
      try {
        cb.onMessage(JSON.parse(String(ev.data)) as WireMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      if (!everOpened && onGiveUp) return giveUp();
      cb.onStatus('closed');
      const delay = Math.min(10_000, 500 * 2 ** retry++);
      timer = setTimeout(connect, delay);
    };
  };

  if (onGiveUp) giveUpTimer = setTimeout(giveUp, AUTO_TIMEOUT_MS);
  connect();

  return {
    send: (msg) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      else if (queue.length < 200) queue.push(msg);
    },
    close: () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(giveUpTimer);
      ws?.close();
    },
  };
}

function createTransport(roomId: string, cb: TransportCallbacks): Transport {
  const { url, auto } = resolveRelayUrl();
  let inner: Transport | null = null;
  let closed = false;

  const useBroadcast = (reason: string) => {
    if (closed) return;
    inner = createBroadcastTransport(roomId, cb);
    if (inner) cb.onKind('broadcast', reason);
    else {
      cb.onKind('none', 'No realtime transport available — solo mode');
      queueMicrotask(() => cb.onStatus('closed'));
    }
  };

  if (url) {
    cb.onKind('websocket', `Connecting to relay ${url.replace(/^wss?:\/\//, '')}`);
    inner = createWebSocketTransport(
      url,
      roomId,
      cb,
      auto ? () => useBroadcast('Relay not reachable — syncing between tabs of this browser instead') : undefined,
    );
  } else {
    useBroadcast('Relay disabled — syncing between tabs of this browser');
  }

  return {
    send: (msg) => inner?.send(msg),
    close: () => {
      closed = true;
      inner?.close();
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Human-readable activity lines                                      */
/* ------------------------------------------------------------------ */

function describe(action: SharedAction, state: SharedRoomState): string | null {
  const name = (id: string) => state.members.find((m) => m.id === id)?.displayName ?? 'Someone';
  switch (action.type) {
    case 'member/update':
      if (action.patch.displayName) return `${name(action.id)} is now "${action.patch.displayName}"`;
      if (action.patch.gender) return `${name(action.id)} switched avatar style to ${action.patch.gender}`;
      return null;
    case 'role/swap':
      return `${name(action.id)} walked over to ${ROLE_META[action.role].label}`;
    case 'singing/set':
      return `${name(action.id)} ${action.on ? 'stepped up to the mic 🎤' : 'left the mic'}`;
    case 'comm/set':
      return action.mode === 'jam' ? 'Room switched to JAM MODE 🎸' : 'Room switched to TALK MODE 🗣️';
    case 'led/set':
      return null; // too chatty while dragging sliders
    case 'wb/add':
      return `${name(action.item.updatedBy)} added "${action.item.text}" to the whiteboard`;
    case 'wb/toggle': {
      const item = state.whiteboard.find((w) => w.id === action.id);
      return item ? `${name(action.by)} ${item.done ? 'reopened' : 'crossed off'} "${item.text}"` : null;
    }
    case 'wb/edit':
      return `${name(action.by)} edited a whiteboard goal`;
    case 'wb/remove':
      return 'A whiteboard goal was erased';
    case 'wb/clearDone':
      return 'Completed whiteboard goals were wiped';
    case 'arr/vote':
      return `${name(action.by)} reacted 👍 on an arrangement block`;
    case 'arr/duplicate':
      return 'An arrangement block was duplicated';
    case 'arr/add':
      return `"${action.block.label}" block added to the arrangement`;
    case 'arr/move':
      return 'Arrangement re-ordered';
    case 'companion/set':
      return action.link ? `Companion phone ${action.link.status}` : 'Companion phone unlinked';
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface JamSocketApi {
  status: SocketStatus;
  transport: TransportKind;
  clientId: string;
  latencyMs: number | null;
  /** memberId → last heartbeat (ms epoch) for remote clients. */
  peers: Record<string, number>;
  logs: ActivityEntry[];
  log: (text: string, kind?: ActivityEntry['kind'], who?: string) => void;
  sendEphemeral: (payload: EphemeralMessage) => void;
  onEphemeral: (cb: (payload: EphemeralMessage, from: string) => void) => () => void;
}

const MAX_LOGS = 80;

export function useJamSocket(): JamSocketApi {
  const { roomChannelId, localMemberId, applyRemote, subscribeOutbound, getSharedSnapshot } = useUserPreferences();

  const clientId = useMemo(() => uid('client'), []);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [transportKind, setTransportKind] = useState<TransportKind>('none');
  const [latencyMs, setLatency] = useState<number | null>(null);
  const [peers, setPeers] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<ActivityEntry[]>([]);

  const transport = useRef<Transport | null>(null);
  const ephemeralSubs = useRef(new Set<(p: EphemeralMessage, from: string) => void>());
  const kindRef = useRef<TransportKind>('none');
  const memberRef = useRef(localMemberId);
  memberRef.current = localMemberId;

  const log = useCallback((text: string, kind: ActivityEntry['kind'] = 'socket', who = 'system') => {
    setLogs((prev) => [{ id: uid('log'), at: Date.now(), who, text, kind }, ...prev].slice(0, MAX_LOGS));
  }, []);

  /* ---------- connect / reconnect on room change ---------- */
  useEffect(() => {
    const pendingSync = new Set<string>();

    const handle = (msg: WireMessage) => {
      if (!msg || msg.from === clientId) return;
      switch (msg.type) {
        case 'action': {
          const line = describe(msg.action, getSharedSnapshot());
          applyRemote(msg.action);
          if (line) log(line, 'room', 'remote');
          break;
        }
        case 'sync/request':
          transport.current?.send({ type: 'sync/snapshot', from: clientId, reqId: msg.reqId, state: getSharedSnapshot() });
          log('Sent room snapshot to a joining bandmate', 'socket');
          break;
        case 'sync/snapshot':
          if (pendingSync.delete(msg.reqId)) {
            applyRemote({ type: 'sync/replace', state: msg.state });
            log('Room state synced from bandmates ✓', 'socket');
          }
          break;
        case 'presence':
          setPeers((p) => ({ ...p, [msg.memberId]: Date.now() }));
          break;
        case 'ping':
          transport.current?.send({ type: 'pong', from: clientId, to: msg.from, t: msg.t });
          break;
        case 'pong':
          if (msg.to === clientId) setLatency(Math.round(performance.now() - msg.t));
          break;
        case 'ephemeral':
          ephemeralSubs.current.forEach((cb) => cb(msg.payload, msg.from));
          break;
      }
    };

    const t = createTransport(roomChannelId, {
      onMessage: handle,
      onStatus: (s) => {
        setStatus(s);
        if (s !== 'open') return;
        // (Re)joined: announce ourselves and ask bandmates for the room state.
        t.send({ type: 'presence', from: clientId, memberId: memberRef.current });
        const reqId = uid('sync');
        pendingSync.add(reqId);
        t.send({ type: 'sync/request', from: clientId, reqId });
        // Nobody answered → we're the first in the room; keep local state.
        setTimeout(() => pendingSync.delete(reqId), 1500);
        log(`Joined #${roomChannelId} — ${kindRef.current === 'websocket' ? 'relay online, any device can join' : 'local tabs only'}`, 'socket');
      },
      onKind: (kind, detail) => {
        kindRef.current = kind;
        setTransportKind(kind);
        log(detail, 'socket');
      },
    });
    transport.current = t;

    const heartbeat = setInterval(() => {
      t.send({ type: 'presence', from: clientId, memberId: memberRef.current });
      t.send({ type: 'ping', from: clientId, t: performance.now() });
      setPeers((p) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(p)) if (now - v < 12_000) next[k] = v;
        return next;
      });
    }, 4000);

    return () => {
      clearInterval(heartbeat);
      t.close();
      transport.current = null;
    };
  }, [roomChannelId, clientId, applyRemote, getSharedSnapshot, log]);

  /* ---------- forward local shared actions to the network ---------- */
  useEffect(
    () =>
      subscribeOutbound((action) => {
        transport.current?.send({ type: 'action', from: clientId, action });
        const line = describe(action, getSharedSnapshot());
        if (line) log(line, 'room', 'you');
      }),
    [subscribeOutbound, clientId, getSharedSnapshot, log],
  );

  const sendEphemeral = useCallback(
    (payload: EphemeralMessage) => transport.current?.send({ type: 'ephemeral', from: clientId, payload }),
    [clientId],
  );

  const onEphemeral = useCallback((cb: (p: EphemeralMessage, from: string) => void) => {
    ephemeralSubs.current.add(cb);
    return () => {
      ephemeralSubs.current.delete(cb);
    };
  }, []);

  return useMemo(
    () => ({ status, transport: transportKind, clientId, latencyMs, peers, logs, log, sendEphemeral, onEphemeral }),
    [status, transportKind, clientId, latencyMs, peers, logs, log, sendEphemeral, onEphemeral],
  );
}
