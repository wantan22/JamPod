import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Auth {
  /** Handles /api/* routes. Resolves true if the request was handled. */
  handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** True if the request's session belongs to a member of the band whose room id is `room`. */
  canJoinRoom(req: IncomingMessage, room: string): boolean;
}

/** Uses Postgres when `databaseUrl` (default: process.env.DATABASE_URL) is set, else `${dataDir}/jampod-db.json`. */
export function createAuth(opts: { dataDir: string; databaseUrl?: string; log?: (msg: string) => void }): Auth;
