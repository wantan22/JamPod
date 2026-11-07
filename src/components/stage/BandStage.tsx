import { useEffect, useMemo, useRef, useState } from 'react';
import type { InstrumentRole, MemberProfile, RGBA, ThemeMode, WhiteboardItem } from '../../types';
import { ROLE_META } from '../../types';
import { rgba, shade } from '../../lib/utils';
import { Character } from './Character';
import { Amp, DrumKit, Keyboard, StandWithInstrument, Stool, VintageMic } from './StationProps';
import { WallWhiteboard } from './WallWhiteboard';

/* ------------------------------------------------------------------ */
/*  Stage coordinate system: viewBox 1000 × 560                        */
/*  Wall: y 0–300 · Floor: y 300–560 (perspective grid)                */
/* ------------------------------------------------------------------ */

export const STATIONS: Record<InstrumentRole, { x: number; y: number; scale: number; facing: 1 | -1 }> = {
  drums: { x: 330, y: 392, scale: 0.92, facing: 1 },
  keys: { x: 670, y: 392, scale: 0.92, facing: -1 },
  bass: { x: 160, y: 500, scale: 1.05, facing: 1 },
  guitar: { x: 840, y: 500, scale: 1.05, facing: -1 },
};

const WALK_MS = 1400;

/** Tracks whether a member is mid-walk after a role change. */
function useWalking(role: InstrumentRole): boolean {
  const prev = useRef(role);
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    if (prev.current === role) return;
    prev.current = role;
    setWalking(true);
    const t = setTimeout(() => setWalking(false), WALK_MS);
    return () => clearTimeout(t);
  }, [role]);
  return walking;
}

/** ~20fps synthetic amplitude for remote singers with no level feed. */
function useSyntheticPulse(active: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last > 50) {
        last = now;
        setT(now / 1000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

interface StagedMemberProps {
  member: MemberProfile;
  isLocal: boolean;
  level: number;
  led: RGBA;
  onWalkingChange: (id: string, walking: boolean) => void;
}

function StagedMember({ member, isLocal, level, led, onWalkingChange }: StagedMemberProps) {
  const walking = useWalking(member.role);
  const st = STATIONS[member.role];

  useEffect(() => onWalkingChange(member.id, walking), [walking, member.id, onWalkingChange]);

  const auraR = 70 + level * 70;

  return (
    <g
      style={{
        transform: `translate(${st.x}px, ${st.y}px) scale(${st.scale})`,
        transition: `transform ${WALK_MS}ms cubic-bezier(0.45, 0.05, 0.3, 1)`,
      }}
    >
      {member.isSinging && (
        <g aria-hidden>
          <circle cx={0} cy={-70} r={auraR} fill={`url(#aura-${member.id})`} />
          <circle
            cx={0}
            cy={-70}
            r={60}
            fill="none"
            stroke={rgba(led, 0.55)}
            strokeWidth={2}
            style={{ animation: 'jp-pulse-ring 1.6s ease-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}
          />
          <defs>
            <radialGradient id={`aura-${member.id}`}>
              <stop offset="0%" stopColor={member.tint} stopOpacity={0.15 + level * 0.5} />
              <stop offset="55%" stopColor={rgba(led, 1)} stopOpacity={0.12 + level * 0.25} />
              <stop offset="100%" stopColor={rgba(led, 1)} stopOpacity={0} />
            </radialGradient>
          </defs>
        </g>
      )}

      {(member.role === 'drums' || member.role === 'keys') && !walking && <Stool />}

      <Character
        member={member}
        walking={walking}
        holding={member.role === 'bass' || member.role === 'guitar' ? member.role : null}
        facing={st.facing}
      />

      {member.isSinging && !walking && (
        <g transform={`translate(${st.facing * 40} 26)`}>
          <VintageMic />
        </g>
      )}

      {/* Floating name tag */}
      <g transform="translate(0 -172)">
        <rect
          x={-(member.displayName.length * 5.2 + 26)}
          y={-15}
          width={member.displayName.length * 10.4 + 52}
          height={26}
          rx={13}
          fill="#1d1626"
          opacity={0.88}
          stroke={member.tint}
          strokeWidth={2}
        />
        <circle cx={-(member.displayName.length * 5.2 + 12)} cy={-2} r={4.5} fill={member.online ? '#8fb996' : '#7a6a5e'} />
        <text x={6} y={3.5} textAnchor="middle" fontSize={15} fontWeight={800} fill="#f4f1ea" fontFamily="Nunito">
          {member.displayName}
        </text>
        {isLocal && (
          <text x={0} y={-22} textAnchor="middle" fontSize={10} fontFamily="IBM Plex Mono" fill={member.tint} letterSpacing={2}>
            YOU · {ROLE_META[member.role].label.toUpperCase()}
          </text>
        )}
      </g>
    </g>
  );
}

export interface BandStageProps {
  members: MemberProfile[];
  localMemberId: string;
  ledColor: RGBA;
  theme: ThemeMode;
  whiteboard: WhiteboardItem[];
  dimmed: boolean;
  /** memberId → 0..1 live vocal amplitude (local mic / remote feed). */
  levels: Record<string, number>;
  onOpenWhiteboard: () => void;
}

export function BandStage({
  members,
  localMemberId,
  ledColor,
  theme,
  whiteboard,
  dimmed,
  levels,
  onOpenWhiteboard,
}: BandStageProps) {
  const [walkingIds, setWalkingIds] = useState<Record<string, boolean>>({});
  const onWalkingChange = useMemo(
    () => (id: string, w: boolean) => setWalkingIds((prev) => (prev[id] === w ? prev : { ...prev, [id]: w })),
    [],
  );

  const anySinging = members.some((m) => m.isSinging);
  const t = useSyntheticPulse(anySinging);

  const levelFor = (m: MemberProfile, i: number): number => {
    if (!m.isSinging) return 0;
    const real = levels[m.id];
    if (real !== undefined) return real;
    return 0.35 + 0.3 * Math.abs(Math.sin(t * 2.3 + i)) * Math.abs(Math.sin(t * 0.7 + i * 2));
  };

  const wallBase = theme === 'dark' ? '#17161d' : '#d9cdb7';
  const floorBase = theme === 'dark' ? '#121116' : '#c9b89a';
  const led = rgba(ledColor);
  const ledSoft = rgba(ledColor, ledColor.a * 0.35);

  // Members sorted back-to-front so front-row players overlap correctly.
  const ordered = [...members].sort((a, b) => STATIONS[a.role].y - STATIONS[b.role].y);

  /** Show an instrument on its stand when nobody is currently holding it. */
  const standVisible = (role: 'bass' | 'guitar') => {
    const holder = members.find((m) => m.role === role);
    return !holder || walkingIds[holder.id];
  };

  const vanishing = { x: 500, y: 150 };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-line transition-[filter] duration-500"
      style={{ filter: dimmed ? 'brightness(0.72) saturate(0.9)' : 'none', boxShadow: `0 0 60px -20px ${ledSoft}` }}
    >
      <svg viewBox="0 0 1000 560" className="block h-auto w-full select-none" role="img" aria-label="Virtual jam studio stage">
        <defs>
          <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shade(ledColor, 0.35, 0.55)} />
            <stop offset="100%" stopColor={wallBase} stopOpacity={0} />
          </linearGradient>
          <radialGradient id="floorSpill" cx="50%" cy="20%" r="70%">
            <stop offset="0%" stopColor={led} stopOpacity={0.45} />
            <stop offset="100%" stopColor={led} stopOpacity={0} />
          </radialGradient>
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="foam" width="22" height="22" patternUnits="userSpaceOnUse">
            <rect width="22" height="22" fill={theme === 'dark' ? '#221f2b' : '#b9a789'} />
            <path d="M0 0 L11 11 L0 22 Z M22 0 L11 11 L22 22 Z" fill={theme === 'dark' ? '#2b2736' : '#c7b698'} />
          </pattern>
        </defs>

        {/* ---------- Wall ---------- */}
        <rect x={0} y={0} width={1000} height={300} fill={wallBase} />
        <rect x={0} y={0} width={1000} height={300} fill="url(#wallGrad)" />

        {/* acoustic foam panels */}
        <rect x={60} y={70} width={150} height={150} rx={6} fill="url(#foam)" opacity={0.95} />
        <rect x={790} y={70} width={150} height={150} rx={6} fill="url(#foam)" opacity={0.95} />

        {/* neon sign on the left foam */}
        <text
          x={135}
          y={160}
          textAnchor="middle"
          fontFamily="Fraunces"
          fontWeight={700}
          fontSize={44}
          fill="none"
          stroke={led}
          strokeWidth={2.4}
          filter="url(#neonGlow)"
          className="jp-led"
        >
          jam
        </text>
        {/* vinyl on the right foam */}
        <g transform="translate(865 145)">
          <circle r={48} fill="#141217" stroke="#000" strokeWidth={2} />
          {[38, 30, 22].map((r) => (
            <circle key={r} r={r} fill="none" stroke="#2a2730" strokeWidth={1} />
          ))}
          <circle r={14} fill={led} />
          <circle r={2.5} fill="#141217" />
        </g>

        <WallWhiteboard items={whiteboard} onOpen={onOpenWhiteboard} ledColor={ledColor} />

        {/* LED neon tubes */}
        <g filter="url(#neonGlow)" className="jp-led">
          <line x1={20} y1={22} x2={980} y2={22} stroke={led} strokeWidth={4} strokeLinecap="round" />
          <line x1={22} y1={22} x2={22} y2={290} stroke={led} strokeWidth={4} strokeLinecap="round" />
          <line x1={978} y1={22} x2={978} y2={290} stroke={led} strokeWidth={4} strokeLinecap="round" />
        </g>

        {/* ---------- Floor ---------- */}
        <rect x={0} y={300} width={1000} height={260} fill={floorBase} />
        <rect x={0} y={300} width={1000} height={260} fill="url(#floorSpill)" />
        <g stroke={rgba(ledColor, 0.28)} strokeWidth={1.2}>
          {Array.from({ length: 9 }, (_, i) => {
            const y = 300 + Math.pow(i / 8, 1.7) * 260;
            return <line key={`h${i}`} x1={0} y1={y} x2={1000} y2={y} />;
          })}
          {Array.from({ length: 15 }, (_, i) => {
            const xBottom = -300 + i * 114;
            const k = (300 - vanishing.y) / (560 - vanishing.y);
            const xTop = vanishing.x + (xBottom - vanishing.x) * k;
            return <line key={`v${i}`} x1={xTop} y1={300} x2={xBottom} y2={560} />;
          })}
        </g>
        <line x1={0} y1={300} x2={1000} y2={300} stroke={led} strokeWidth={2.5} filter="url(#neonGlow)" opacity={0.85} />
        {/* rug */}
        <ellipse cx={500} cy={470} rx={250} ry={52} fill={theme === 'dark' ? '#2a2133' : '#a88f6d'} opacity={0.75} />
        <ellipse cx={500} cy={470} rx={226} ry={44} fill="none" stroke={rgba(ledColor, 0.5)} strokeDasharray="6 8" strokeWidth={2} />

        {/* ---------- Back props ---------- */}
        <Amp x={STATIONS.keys.x + 92} label="KEYS" glow={led} />
        <g transform={`translate(${STATIONS.bass.x + 70} ${STATIONS.bass.y - 64}) scale(0.9)`}>
          <Amp x={0} label="BASS" glow={led} />
        </g>
        <g transform={`translate(${STATIONS.guitar.x - 70} ${STATIONS.guitar.y - 64}) scale(0.9)`}>
          <Amp x={0} label="GTR" glow={led} />
        </g>

        {/* ---------- Players + front props, back-to-front ---------- */}
        {(['drums', 'keys', 'bass', 'guitar'] as InstrumentRole[]).map((role) => {
          const st = STATIONS[role];
          return (
            <g key={`station-${role}`}>
              {role === 'bass' && standVisible('bass') && (
                <g transform={`translate(${st.x + 28} ${st.y}) scale(${st.scale})`}>
                  <StandWithInstrument role="bass" />
                </g>
              )}
              {role === 'guitar' && standVisible('guitar') && (
                <g transform={`translate(${st.x - 28} ${st.y}) scale(${st.scale})`}>
                  <StandWithInstrument role="guitar" />
                </g>
              )}
            </g>
          );
        })}

        {ordered.map((m) => (
          <StagedMember
            key={m.id}
            member={m}
            isLocal={m.id === localMemberId}
            level={levelFor(m, members.indexOf(m))}
            led={ledColor}
            onWalkingChange={onWalkingChange}
          />
        ))}

        {/* Kit + keyboard sit in front of their (possibly empty) stations. */}
        <g transform={`translate(${STATIONS.drums.x} ${STATIONS.drums.y + 26}) scale(${STATIONS.drums.scale})`}>
          <DrumKit accent={members.find((m) => m.role === 'drums')?.tint ?? '#8a7f9a'} />
        </g>
        <g transform={`translate(${STATIONS.keys.x - 6} ${STATIONS.keys.y + 18}) scale(${STATIONS.keys.scale})`}>
          <Keyboard />
        </g>
        {members.length < 4 && (
          <g fontFamily="IBM Plex Mono" fontSize={11} fill={rgba(ledColor, 0.75)} textAnchor="middle">
            {(['drums', 'keys', 'bass', 'guitar'] as InstrumentRole[])
              .filter((role) => !members.some((m) => m.role === role))
              .map((role) => (
                <text key={role} x={STATIONS[role].x} y={STATIONS[role].y - 120}>
                  open seat · {ROLE_META[role].label.toLowerCase()}
                </text>
              ))}
          </g>
        )}
      </svg>
    </div>
  );
}
