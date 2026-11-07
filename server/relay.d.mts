import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

export interface Relay {
  /** Returns true if the request targeted the relay path and was handled. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** Returns true if the request was /jam/health or /jam/info and was answered. */
  handleHttp(req: IncomingMessage, res: ServerResponse): boolean;
  stats(): { rooms: number; clients: number };
  close(): void;
}

export function createRelay(opts?: {
  path?: string;
  log?: (msg: string) => void;
  /** Return false to reject the WebSocket upgrade with 401. */
  authorize?: (req: IncomingMessage, room: string) => boolean;
}): Relay;
export function lanAddresses(): string[];
