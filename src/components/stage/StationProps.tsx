import type { InstrumentRole } from '../../types';

const OUTLINE = '#1d1626';

/** Stool every player sits on. */
export function Stool() {
  return (
    <g>
      <rect x={-22} y={-24} width={44} height={9} rx={4} fill="#6b4a3a" stroke={OUTLINE} strokeWidth={3} />
      <path d="M-16 -15 L -20 0 M16 -15 L 20 0 M0 -15 L0 0" stroke={OUTLINE} strokeWidth={3.5} strokeLinecap="round" />
    </g>
  );
}

/** Amp cabinet that sits behind bass / guitar / keys stations. */
export function Amp({ x, label, glow }: { x: number; label: string; glow: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={-26} y={-70} width={52} height={62} rx={6} fill="#2a2430" stroke={OUTLINE} strokeWidth={3} />
      <rect x={-20} y={-58} width={40} height={40} rx={4} fill="#3a3342" />
      <circle cx={0} cy={-38} r={14} fill="#1f1a24" stroke="#4a4152" strokeWidth={2} />
      <circle cx={0} cy={-38} r={4} fill="#4a4152" />
      <rect x={-20} y={-67} width={40} height={6} rx={2} fill="#d6b48a" />
      <circle cx={16} cy={-64} r={2} fill={glow} />
      <text x={0} y={-62.5} fontSize={5} textAnchor="middle" fill="#2a2430" fontFamily="IBM Plex Mono" fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

/** Drum kit drawn in FRONT of the seated drummer. */
export function DrumKit({ accent }: { accent: string }) {
  return (
    <g>
      {/* cymbals */}
      <line x1={-74} y1={-8} x2={-70} y2={-92} stroke="#8a8a96" strokeWidth={3} />
      <ellipse cx={-70} cy={-92} rx={26} ry={5} fill="#e8c46a" stroke={OUTLINE} strokeWidth={2.5} />
      <line x1={76} y1={-8} x2={72} y2={-100} stroke="#8a8a96" strokeWidth={3} />
      <ellipse cx={72} cy={-100} rx={24} ry={5} fill="#e8c46a" stroke={OUTLINE} strokeWidth={2.5} />
      {/* toms */}
      <rect x={-46} y={-62} width={34} height={22} rx={6} fill={accent} stroke={OUTLINE} strokeWidth={3} />
      <rect x={12} y={-62} width={34} height={22} rx={6} fill={accent} stroke={OUTLINE} strokeWidth={3} />
      {/* snare + floor tom */}
      <rect x={-70} y={-38} width={36} height={18} rx={5} fill="#e9e3d6" stroke={OUTLINE} strokeWidth={3} />
      <rect x={36} y={-38} width={38} height={32} rx={6} fill={accent} stroke={OUTLINE} strokeWidth={3} />
      {/* kick */}
      <circle cx={0} cy={-22} r={26} fill={accent} stroke={OUTLINE} strokeWidth={3.2} />
      <circle cx={0} cy={-22} r={18} fill="#f4f1ea" stroke={OUTLINE} strokeWidth={2} />
      <text x={0} y={-18} fontSize={11} textAnchor="middle" fontFamily="Fraunces" fontWeight={700} fill="#7c5cff">
        JP
      </text>
    </g>
  );
}

/** Keyboard on an X-stand, in front of the pianist. */
export function Keyboard() {
  return (
    <g>
      <path d="M-40 0 L 40 -40 M40 0 L -40 -40" stroke="#3a3342" strokeWidth={5} strokeLinecap="round" />
      <rect x={-62} y={-54} width={124} height={18} rx={4} fill="#2a2430" stroke={OUTLINE} strokeWidth={3} />
      <g>
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={-58 + i * 8.3} y={-50} width={7.6} height={11} rx={1} fill="#f7f2e7" />
        ))}
        {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => (
          <rect key={`b${i}`} x={-53.5 + i * 8.3} y={-50} width={4.6} height={6.5} fill="#1d1626" />
        ))}
      </g>
      <circle cx={52} cy={-45} r={2} fill="#8fb996" />
    </g>
  );
}

/** Empty guitar/bass stand shown while nobody is holding that instrument. */
export function StandWithInstrument({ role }: { role: Extract<InstrumentRole, 'bass' | 'guitar'> }) {
  const body = role === 'bass' ? '#7c5cff' : '#e07a5f';
  const neck = role === 'bass' ? 72 : 60;
  return (
    <g>
      <path d="M-14 0 L 0 -24 L 14 0" stroke="#3a3342" strokeWidth={4} fill="none" strokeLinecap="round" />
      <rect x={-3} y={-24 - neck} width={6} height={neck} rx={2} fill="#d6b48a" stroke={OUTLINE} strokeWidth={2} />
      <path
        d="M0 -48 C -22 -48, -22 -26, -10 -22 C -22 -14, -16 2, 0 0 C 16 2, 22 -14, 10 -22 C 22 -26, 22 -48, 0 -48 Z"
        fill={body}
        stroke={OUTLINE}
        strokeWidth={3}
        transform="translate(0 -4)"
      />
    </g>
  );
}

/** Vintage studio mic (55 Shure-style capsule) on a boom stand. */
export function VintageMic() {
  return (
    <g>
      <ellipse cx={0} cy={0} rx={16} ry={4} fill="#2a2430" stroke={OUTLINE} strokeWidth={2.5} />
      <line x1={0} y1={0} x2={0} y2={-74} stroke="#9a9aa6" strokeWidth={4} />
      <g transform="translate(0 -88)">
        <rect x={-10} y={-16} width={20} height={30} rx={10} fill="#d8d8de" stroke={OUTLINE} strokeWidth={2.5} />
        {[-8, -3, 2, 7].map((y) => (
          <line key={y} x1={-8} y1={y} x2={8} y2={y} stroke="#8a8a96" strokeWidth={1.5} />
        ))}
        <rect x={-4} y={14} width={8} height={6} fill="#9a9aa6" stroke={OUTLINE} strokeWidth={2} />
      </g>
    </g>
  );
}
