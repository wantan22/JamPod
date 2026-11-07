import { memo } from 'react';
import type { GenderPreset, InstrumentRole, MemberProfile } from '../../types';

/* ------------------------------------------------------------------ */
/*  Chibi bandmate — pure SVG, drawn around a (0,0) foot origin.        */
/*  Styling echoes the JamPod mascot: cream skin, rosy blush, open      */
/*  smile, chunky dark outlines.                                        */
/* ------------------------------------------------------------------ */

const OUTLINE = '#1d1626';
const SKIN = '#fbefe1';
const BLUSH = '#f4a6c1';

const HAIR: Record<GenderPreset, string> = {
  masculine: '#3b2a24',
  feminine: '#5b3a2e',
  nonbinary: '#2f3d4f',
};

function Hair({ gender, back }: { gender: GenderPreset; back: boolean }) {
  const c = HAIR[gender];
  if (gender === 'feminine') {
    return back ? (
      <path
        d="M-34 -96 C -42 -60, -40 -40, -30 -30 L 30 -30 C 40 -40, 42 -60, 34 -96 Z"
        fill={c}
        stroke={OUTLINE}
        strokeWidth={3}
      />
    ) : (
      <g>
        <path
          d="M-31 -92 C -30 -124, 30 -124, 31 -92 C 20 -104, 4 -100, 0 -108 C -6 -100, -20 -104, -31 -92 Z"
          fill={c}
          stroke={OUTLINE}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {/* bow */}
        <g transform="translate(20 -112) rotate(18)">
          <path d="M0 0 L-10 -7 L-10 7 Z M0 0 L10 -7 L10 7 Z" fill="#c084fc" stroke={OUTLINE} strokeWidth={2} />
          <circle r={3} fill="#c084fc" stroke={OUTLINE} strokeWidth={2} />
        </g>
      </g>
    );
  }
  if (gender === 'nonbinary') {
    return back ? (
      <g fill={c} stroke={OUTLINE} strokeWidth={3}>
        <circle cx={-28} cy={-72} r={11} />
        <circle cx={28} cy={-72} r={11} />
      </g>
    ) : (
      <g>
        {/* curly fringe */}
        <g fill={c} stroke={OUTLINE} strokeWidth={2.5}>
          <circle cx={-22} cy={-98} r={9} />
          <circle cx={-8} cy={-104} r={9} />
          <circle cx={8} cy={-104} r={9} />
          <circle cx={22} cy={-98} r={9} />
        </g>
        {/* beanie */}
        <path
          d="M-30 -102 C -28 -132, 28 -132, 30 -102 Z"
          fill="#8fb996"
          stroke={OUTLINE}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <rect x={-32} y={-106} width={64} height={9} rx={4} fill="#6e8b67" stroke={OUTLINE} strokeWidth={2.5} />
        <circle cx={0} cy={-133} r={5} fill="#f4f1ea" stroke={OUTLINE} strokeWidth={2} />
      </g>
    );
  }
  // masculine — short tufted crop
  return back ? null : (
    <path
      d="M-31 -90 C -36 -120, -10 -128, 4 -122 C 14 -130, 34 -120, 31 -90 C 24 -100, 14 -98, 8 -104 C 0 -96, -16 -100, -31 -90 Z"
      fill={c}
      stroke={OUTLINE}
      strokeWidth={3}
      strokeLinejoin="round"
    />
  );
}

/** Instrument held in-hand (bass & guitar). Drums/keys live at the station. */
function HeldInstrument({ role, tint }: { role: InstrumentRole; tint: string }) {
  if (role !== 'bass' && role !== 'guitar') return null;
  const isBass = role === 'bass';
  const body = isBass ? '#7c5cff' : '#e07a5f';
  const neckLen = isBass ? 74 : 60;
  return (
    <g transform="translate(-4 -34) rotate(-28)">
      {/* neck */}
      <rect x={10} y={-4} width={neckLen} height={8} rx={2} fill="#d6b48a" stroke={OUTLINE} strokeWidth={2.5} />
      <rect x={8 + neckLen} y={-7} width={14} height={14} rx={3} fill="#3b2a24" stroke={OUTLINE} strokeWidth={2.5} />
      {/* body */}
      <path
        d="M-30 0 C -30 -22, -10 -20, -4 -12 C 2 -22, 18 -20, 16 0 C 18 20, 2 22, -4 12 C -10 20, -30 22, -30 0 Z"
        fill={body}
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <circle cx={-8} cy={0} r={5} fill={OUTLINE} opacity={0.8} />
      <line x1={-24} y1={0} x2={88} y2={0} stroke="#f4f1ea" strokeWidth={0.9} opacity={0.8} />
      {/* strap in member tint */}
      <path d="M-26 -10 Q 0 -44, 40 -16" fill="none" stroke={tint} strokeWidth={4} opacity={0.9} />
    </g>
  );
}

export interface CharacterProps {
  member: MemberProfile;
  walking: boolean;
  holding: InstrumentRole | null;
  facing: 1 | -1;
}

function CharacterImpl({ member, walking, holding, facing }: CharacterProps) {
  const seated = !walking;
  const shirt = member.tint;

  return (
    <g className={walking ? 'jp-walk' : 'jp-bob'} style={{ transformBox: 'fill-box', transformOrigin: 'bottom center' }}>
      {/* ground shadow */}
      <ellipse cx={0} cy={2} rx={34} ry={7} fill="#000" opacity={0.22} />

      <g transform={`scale(${facing} 1)`}>
        {/* legs */}
        {seated ? (
          <g fill="#2b2f45" stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round">
            <path d="M-20 -26 h 16 v 10 h 8 v 14 h -24 Z" />
            <path d="M4 -26 h 16 v 24 h -24 v -14 h 8 Z" />
          </g>
        ) : (
          <g fill="#2b2f45" stroke={OUTLINE} strokeWidth={3}>
            <rect x={-17} y={-30} width={13} height={30} rx={5} />
            <rect x={4} y={-30} width={13} height={30} rx={5} />
          </g>
        )}

        <Hair gender={member.gender} back />

        {/* torso */}
        <path
          d="M-26 -28 C -28 -54, -20 -64, 0 -64 C 20 -64, 28 -54, 26 -28 Z"
          fill={shirt}
          stroke={OUTLINE}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {member.gender === 'feminine' && (
          <path d="M-26 -30 L -32 -18 L 32 -18 L 26 -30 Z" fill={shirt} stroke={OUTLINE} strokeWidth={3} />
        )}

        {/* arms */}
        <g stroke={OUTLINE} strokeWidth={3} fill={SKIN}>
          <ellipse cx={-27} cy={-40} rx={7} ry={12} transform="rotate(18 -27 -40)" />
          <ellipse cx={27} cy={-40} rx={7} ry={12} transform="rotate(-18 27 -40)" />
        </g>

        {/* head */}
        <circle cx={0} cy={-88} r={32} fill={SKIN} stroke={OUTLINE} strokeWidth={3.2} />
        <g className="jp-blink">
          <ellipse cx={-11} cy={-88} rx={3.6} ry={4.6} fill={OUTLINE} />
          <ellipse cx={11} cy={-88} rx={3.6} ry={4.6} fill={OUTLINE} />
          <circle cx={-10} cy={-90} r={1.2} fill="#fff" />
          <circle cx={12} cy={-90} r={1.2} fill="#fff" />
        </g>
        <ellipse cx={-20} cy={-78} rx={6} ry={3.6} fill={BLUSH} opacity={0.85} />
        <ellipse cx={20} cy={-78} rx={6} ry={3.6} fill={BLUSH} opacity={0.85} />
        <path d="M-6 -78 Q 0 -70, 6 -78 Z" fill="#e2668c" stroke={OUTLINE} strokeWidth={2} strokeLinejoin="round" />

        <Hair gender={member.gender} back={false} />

        {/* headphones — the mascot's signature */}
        <path d="M-33 -92 C -33 -132, 33 -132, 33 -92" fill="none" stroke="#8b6fe8" strokeWidth={6} strokeLinecap="round" />
        <rect x={-40} y={-100} width={11} height={20} rx={5} fill="#6b54c9" stroke={OUTLINE} strokeWidth={2.5} />
        <rect x={29} y={-100} width={11} height={20} rx={5} fill="#6b54c9" stroke={OUTLINE} strokeWidth={2.5} />

        {!walking && holding && <HeldInstrument role={holding} tint={member.tint} />}
      </g>
    </g>
  );
}

export const Character = memo(CharacterImpl);
