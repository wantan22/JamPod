# JamPod

A pressure-free, collaborative band practice studio in the browser. No scores, no streaks, no grades.

**Stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · Web Audio API · MediaRecorder · WebSocket relay (Node + `ws`)

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server runs the whole stack on one origin: the app, the accounts API at `/api`, and the realtime relay at `/jam`.

## Accounts and bands

1. **Log in or create an account** (email, password, display name). The login is a 90-day HttpOnly cookie that renews whenever you visit, so you stay signed in after closing the browser until you press **Log out**.
2. **Pick a jam room.** Each band is its own room. One person can be in several bands (up to 20) and plays a seat in each: seat 1 is drums, 2 keys, 3 bass, 4 guitar. A band holds up to 4 people, one per stage station.
3. **Start a band** to get a 6-character invite code, or **join** with a code someone sent you. The **🔗 invite** button in the studio header copies a link with the code. Opening it signs the person in or up and adds them to the band.

Inside a room, click the logo or **⇦ rooms** to switch bands. The profile drawer has **Switch room**, **Leave this band** and **Log out**. Your display name, character style and tint are saved to your account and follow you into every band.

**Security:**
- Passwords are hashed with scrypt and a per-user salt.
- Only a SHA-256 hash of each session token is stored.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS.
- Write requests must be JSON from the same origin.
- Login and registration are rate-limited.
- The relay rejects WebSocket connections from anyone who isn't a signed-in member of that band.
- The Vite dev server refuses to serve anything under `server/`.

Data lives in `server/data/jampod-db.json` (git-ignored; set `JAMPOD_DATA_DIR` to move it). A band's live room state (whiteboard, LED, arrangement) is shared between whoever is connected, and resets to a starter board when everyone has left.

### Jam across devices on the same Wi-Fi

1. Run `npm run dev`. The terminal prints a **Network** address such as `http://192.168.1.20:5173`.
2. Click **🔗 invite** in the studio header. It copies a link with your LAN address (not `localhost`) and your band's invite code.
3. Bandmates open it on their own device, sign up or log in, and land in your room.

**Using a phone as the talk mic:** phones only allow the microphone on HTTPS pages. Run `npm run dev:https` instead (self-signed certificate), click **Link phone** and scan the QR code. On the phone, accept the certificate warning once and log in with the same account.

To test with two people on one computer, use two browsers (or a normal and a private window), because each browser keeps one login.

### How the relay works

`server/relay.mjs` is a stateless, room-scoped fan-out. Each signed-in member connects to `/jam?room=<band id>`, and every message goes to the other members in that room. A device that joins asks its bandmates for a snapshot. Limits: 16 connections per room, 512 KB per message, 120 messages/second per client, and a ping every 15 s.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/register`, `/api/login`, `/api/logout` | Account and session |
| `GET /api/me`, `PATCH /api/me` | Current user and bands, and profile edits |
| `POST /api/bands`, `/api/bands/join`, `/api/bands/leave` | Band membership |
| `GET /jam/health`, `/jam/info` | Relay stats, and LAN IPs for invite and QR links |

## Production

```bash
npm run build
npm start          # server/index.mjs: app + /api + /jam on $PORT (default 8787)
```

This is one Node process serving everything from one origin, so the login cookie stays first-party. Run a single instance, because it keeps an in-memory copy of accounts. Accounts are stored in:
- **Postgres** when `DATABASE_URL` is set. The schema is in `server/schema.sql`.
- **`server/data/jampod-db.json`** otherwise. That needs a persistent disk.

`npm start` also reads a local `.env` file if one exists.

### Free deploy: Render + Supabase

Render's free web service supports WebSockets but has no disk, so accounts live in a free Supabase Postgres database.

1. **Supabase:** create a free project and apply `server/schema.sql`. Create a login role for the app (`create role jampod_app login password '…'`). Then build the **Session pooler** connection string:
   `postgresql://jampod_app.<project-ref>:<password>@<pooler-host>:5432/postgres`
2. **GitHub:** push this folder to its own repository.
3. **Render:** choose **New → Blueprint** and pick the repo; `render.yaml` sets up everything else. When asked for `DATABASE_URL`, paste the connection string.

Free-tier trade-offs:
- Render sleeps after 15 minutes without traffic, and the first visit after that takes about a minute.
- Supabase pauses a free project after a week with no activity. Restore it from the dashboard.
- Vercel can't hold WebSockets, so it can't host this.

## First-time guide

New visitors get a 22-step spotlight tour covering setup, the Band Room, Song Studio, Arrangement and Music Vault. It switches tabs on its own and works with ← → and Esc. Replay it from the **? Guide** button in the header. Steps are plain data in `src/components/onboarding/tourSteps.ts`; each one points at a `data-tour="…"` attribute in the UI. To show the tour again, clear the `jampod.tourDone.v1` key in localStorage.

## Where things live

| Area | File |
| --- | --- |
| Global state (theme, room, seat, roles, profiles, whiteboard, singing, jam/talk, `ledColor`) | `src/context/UserPreferencesContext.tsx` |
| Mic acquisition, per-instrument frequency gate, vocal band → WebRTC-ready stream, live chord detection | `src/hooks/useAudioProcessor.ts` |
| Realtime transport (relay → tab fallback), snapshot sync on join, presence, latency, activity log | `src/hooks/useJamSocket.ts` |
| Production server (app + API + relay on one port) | `server/index.mjs` |
| Accounts, sessions, bands API + JSON storage | `server/auth.mjs` |
| Members-only WebSocket relay (also mounted into Vite by `vite.config.ts`) | `server/relay.mjs` |
| Login/register screen, room picker, session state, app flow | `src/auth/*`, `src/App.tsx` |
| LAN-aware invite and QR links | `src/hooks/useShareOrigin.ts` |
| Layout orchestrator | `src/components/JamPodDashboard.tsx` |
| Band Room stage, characters, wall whiteboard | `src/components/stage/*` |
| Media Dock, chord highway, vocal node, LED deck, companion mic, profile drawer, video grid | `src/components/live/*` |
| Song Studio (record, trim, 3-band EQ, reverb, publish) | `src/components/studio/*`, `src/hooks/useStudioPlayback.ts`, `src/hooks/useLayerRecorder.ts` |
| Arrangement Board | `src/components/arrangement/ArrangementBoard.tsx` |
| Music Vault (version tree, teleprompter, setlists) | `src/components/vault/*`, `src/context/LibraryContext.tsx` |

## What is real vs. mocked

- **Real:** mic capture and filter graph, live chord recognition, MP3 chord extraction (chroma + template matching, runs locally), multi-track playback with live EQ and reverb, MediaRecorder takes, offline bounce → WAV → gzip, multi-device realtime sync through the WebSocket relay, phone companion mic, QR pairing, webcam tile.
- **Mocked / to wire up:** the cloud bucket upload (a simulated progress loop in `TrackLane.tsx`; replace it with a signed-URL PUT) and WebRTC peer audio/video. `audio.vocalStream` is ready to pass to `RTCPeerConnection.addTrack`, and the relay can carry the signalling.
- **Backing tracks across devices:** an MP3 stays on the device that loaded it. Bandmates get the chord chart and follow that player's play, pause and seek, so their chord highway scrolls in sync, but the audio itself plays from the loader's speakers. YouTube tracks play on every device.
- **Song library:** the Song Studio, versions and setlists are still stored per device and not synced yet.
- **YouTube:** browsers can't decode cross-origin YouTube audio, so YouTube imports use the embedded player plus an editable chord progression.
