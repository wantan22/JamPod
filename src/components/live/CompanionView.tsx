import { useEffect, useRef, useState } from 'react';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { useJamSocket } from '../../hooks/useJamSocket';
import { cx } from '../../lib/utils';

/**
 * The page a bandmate's phone opens after scanning the pairing QR. It holds
 * one mic track and simply toggles `track.enabled` from the room's comm mode.
 */
export function CompanionView() {
  const { shared, dispatchShared, me, roomChannelId } = useUserPreferences();
  const socket = useJamSocket();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const announced = useRef(false);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const talk = shared.commMode === 'talk';

  // Announce pairing once the socket is up and we've had a chance to sync.
  useEffect(() => {
    if (socket.status !== 'open' || announced.current) return;
    const t = setTimeout(() => {
      announced.current = true;
      dispatchShared({ type: 'companion/set', link: { memberId: me.id, token, status: 'paired', micLive: talk } });
    }, 1700);
    return () => clearTimeout(t);
  }, [socket.status, dispatchShared, me.id, token, talk]);

  // Route: mute in Jam, live in Talk.
  useEffect(() => {
    stream?.getAudioTracks().forEach((tr) => (tr.enabled = talk));
    if (stream) socket.sendEphemeral({ kind: 'companion-ping', memberId: me.id, micLive: talk });
  }, [talk, stream, socket, me.id]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const enable = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      setStream(s);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <main className="relative z-10 flex min-h-full flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/jampod-logo.webp" alt="JamPod" className="size-20 rounded-2xl" />
      <div>
        <p className="jp-label">Companion mic · #{roomChannelId}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{me.displayName}’s phone</h1>
      </div>
      <div
        className={cx(
          'grid size-44 place-items-center rounded-full text-6xl transition-all duration-500',
          stream && talk ? 'bg-ok/25 shadow-[0_0_60px_rgba(143,185,150,.6)] ring-4 ring-ok' : 'bg-panel',
        )}
        aria-live="polite"
        aria-label={stream ? (talk ? 'Microphone live' : 'Microphone muted') : 'Microphone not enabled'}
      >
        {stream ? (talk ? '🎙️' : '🔇') : '📱'}
      </div>
      <p className="max-w-xs text-sm text-muted">
        {stream
          ? talk
            ? 'TALK MODE — your voice is live to the band.'
            : 'JAM MODE — muted so only your instrument line is heard.'
          : 'Tap below to let this phone act as your talk mic.'}
      </p>
      {!stream && (
        <button onClick={() => void enable()} className="jp-btn-accent px-6 py-3 text-base">
          Enable phone mic
        </button>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="font-mono text-[10px] text-muted">
        link {socket.status} · {socket.transport}
      </p>
    </main>
  );
}
