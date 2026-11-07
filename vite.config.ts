import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';
import { defineConfig, type Connect, type Plugin, type PluginOption, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { createAuth } from './server/auth.mjs';
import { createRelay, lanAddresses } from './server/relay.mjs';

const DATA_DIR = fileURLToPath(new URL('./server/data', import.meta.url));

/**
 * Mounts the JamPod backend on Vite's own HTTP server: the accounts API at
 * /api and the members-only relay at /jam. `npm run dev` is the whole stack,
 * on one origin, so the login cookie just works (also over `dev:https`).
 */
function jamBackend(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer, label: string) => {
    const auth = createAuth({ dataDir: DATA_DIR });
    const relay = createRelay({ log: (m) => console.log(m), authorize: auth.canJoinRoom });
    // Vite's HTTPS dev server is HTTP/2 with HTTP/1.1 fallback; WebSocket upgrades use the latter.
    const http = server.httpServer as HttpServer | null;
    http?.on('upgrade', (req, socket, head) => relay.handleUpgrade(req, socket, head));
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      auth
        .handleHttp(req, res)
        .then((handled) => {
          if (!handled && !relay.handleHttp(req, res)) next();
        })
        .catch(next);
    });
    http?.once('listening', () => {
      console.log(`  ➜  JamPod API at /api · relay at /jam (${label}) · LAN: ${lanAddresses().join(', ') || 'none found'}`);
    });
    http?.once('close', () => relay.close());
  };
  return {
    name: 'jampod-backend',
    configureServer: (server) => attach(server, 'dev'),
    configurePreviewServer: (server) => attach(server, 'preview'),
  };
}

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss(), jamBackend()];
  // `npm run dev:https` → self-signed HTTPS so phones on your LAN can use the mic.
  if (mode === 'https') plugins.push(basicSsl());
  return {
    plugins,
    server: {
      port: 5173,
      host: true,
      watch: { ignored: ['**/server/data/**'] },
      // Never let the dev server hand out the account database or server code.
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/server/**'] },
    },
    preview: { port: 4173, host: true },
  };
});
