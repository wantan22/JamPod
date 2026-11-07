import { useEffect, useRef, useState } from 'react';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { cx } from '../../lib/utils';
import type { MemberProfile } from '../../types';
import { ROLE_META } from '../../types';
import { Character } from '../stage/Character';

interface VideoGridProps {
  peers: Record<string, number>;
  levels: Record<string, number>;
}

/**
 * Telepresence column. Your tile uses the real webcam; bandmate tiles show
 * their avatar until a WebRTC video track is attached (signalling hooks into
 * the same socket used for state sync).
 */
export function VideoGrid({ peers, levels }: VideoGridProps) {
  const { members, me, commMode } = useUserPreferences();
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cam;
  }, [cam]);

  useEffect(() => () => cam?.getTracks().forEach((t) => t.stop()), [cam]);

  const toggleCam = async () => {
    if (cam) {
      cam.getTracks().forEach((t) => t.stop());
      setCam(null);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, facingMode: 'user' }, audio: false });
      setCam(s);
      setCamErr(null);
    } catch (e) {
      setCamErr((e as DOMException).name === 'NotAllowedError' ? 'Camera blocked' : 'No camera found');
    }
  };

  const others = members.filter((m) => m.id !== me.id);

  return (
    <section aria-labelledby="video-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="video-title" className="jp-label">
          Band call · {1 + Object.keys(peers).length} connected
        </h2>
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-extrabold', commMode === 'talk' ? 'bg-ok/20 text-ok' : 'bg-panel text-muted')}>
          {commMode === 'talk' ? 'VOICES UP' : 'VOICES DUCKED'}
        </span>
      </div>

      {/* Local tile */}
      <div className="jp-card overflow-hidden" style={{ outline: `2px solid ${me.tint}`, outlineOffset: -2 }}>
        <div className="relative aspect-video bg-[#0d0c11]">
          {cam ? (
            <video ref={videoRef} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
          ) : (
            <AvatarTile member={me} />
          )}
          <TileLabel member={me} you level={levels[me.id] ?? 0} />
          <button
            onClick={() => void toggleCam()}
            className="absolute top-2 right-2 rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur hover:bg-black/70"
          >
            {cam ? '📷 Off' : '📷 On'}
          </button>
          {camErr && <span className="absolute top-2 left-2 rounded bg-danger/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{camErr}</span>}
        </div>
      </div>

      {/* Remote tiles */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
        {others.map((m) => {
          const connected = Boolean(peers[m.id]);
          return (
            <div key={m.id} className="jp-card overflow-hidden">
              <div className="relative aspect-video bg-[#0d0c11]">
                <AvatarTile member={m} dim={!connected} />
                <TileLabel member={m} level={levels[m.id] ?? (m.isSinging ? 0.4 : 0)} />
                <span
                  className={cx(
                    'absolute top-1.5 right-1.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-medium',
                    connected ? 'bg-ok/80 text-[#0d0c11]' : 'bg-black/50 text-white/70',
                  )}
                >
                  {connected ? 'LIVE' : 'demo'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AvatarTile({ member, dim = false }: { member: MemberProfile; dim?: boolean }) {
  return (
    <div
      className={cx('grid size-full place-items-center transition-opacity', dim && 'opacity-70')}
      style={{ background: `radial-gradient(circle at 50% 70%, ${member.tint}55, transparent 70%)` }}
    >
      <svg viewBox="-50 -135 100 70" className="h-[78%] w-auto" aria-hidden>
        <Character member={member} walking={false} holding={null} facing={1} />
      </svg>
    </div>
  );
}

function TileLabel({ member, you = false, level }: { member: MemberProfile; you?: boolean; level: number }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/75 to-transparent px-2 pt-4 pb-1.5 text-white">
      <span className="truncate text-xs font-extrabold">
        {member.displayName}
        {you && ' (you)'}
      </span>
      <span className="text-[10px] opacity-75">{ROLE_META[member.role].emoji}</span>
      {member.isSinging && <span className="text-[10px]">🎤</span>}
      <span className="ml-auto flex h-3 items-end gap-[2px]" aria-hidden>
        {[0.15, 0.35, 0.6].map((th) => (
          <span key={th} className="w-[3px] rounded-sm bg-[#8fb996] transition-all" style={{ height: `${(th + 0.4) * 100}%`, opacity: level > th ? 1 : 0.25 }} />
        ))}
      </span>
    </div>
  );
}
