import type { KeyboardEvent } from 'react';
import type { RGBA, WhiteboardItem } from '../../types';
import { rgba } from '../../lib/utils';

interface WallWhiteboardProps {
  items: WhiteboardItem[];
  ledColor: RGBA;
  onOpen: () => void;
}

const BOARD = { x: 370, y: 42, w: 260, h: 176 };
const MAX_LINES = 5;

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The whiteboard physically mounted on the studio wall. It mirrors the live
 * setlist (with marker strike-throughs) and opens the full notepad on click.
 */
export function WallWhiteboard({ items, ledColor, onOpen }: WallWhiteboardProps) {
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  const visible = items.slice(0, MAX_LINES);
  const done = items.filter((i) => i.done).length;

  return (
    <g
      data-tour="whiteboard"
      role="button"
      tabIndex={0}
      aria-label={`Session goals whiteboard: ${done} of ${items.length} done. Open notepad.`}
      onClick={onOpen}
      onKeyDown={onKey}
      className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[#e8b464] [&:hover>rect:first-child]:stroke-[#e8b464]"
    >
      {/* frame */}
      <rect
        x={BOARD.x - 8}
        y={BOARD.y - 8}
        width={BOARD.w + 16}
        height={BOARD.h + 16}
        rx={8}
        fill="#8a6a4f"
        stroke="#5b4332"
        strokeWidth={3}
        style={{ transition: 'stroke 200ms' }}
      />
      <rect x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h} rx={4} fill="#fbfaf5" />
      {/* soft LED reflection */}
      <rect x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h} rx={4} fill={rgba(ledColor, 0.08)} />
      <path d={`M${BOARD.x + 160} ${BOARD.y} L ${BOARD.x + 200} ${BOARD.y} L ${BOARD.x + 120} ${BOARD.y + BOARD.h} L ${BOARD.x + 80} ${BOARD.y + BOARD.h} Z`} fill="#fff" opacity={0.45} />

      <text x={BOARD.x + 14} y={BOARD.y + 24} fontFamily="Fraunces" fontWeight={700} fontSize={15} fill="#2f5b8f">
        Today’s Session Goals
      </text>
      <text x={BOARD.x + BOARD.w - 14} y={BOARD.y + 24} textAnchor="end" fontFamily="IBM Plex Mono" fontSize={10} fill="#7a6a5e">
        {done}/{items.length}
      </text>
      <line x1={BOARD.x + 14} y1={BOARD.y + 32} x2={BOARD.x + BOARD.w - 14} y2={BOARD.y + 32} stroke="#2f5b8f" strokeWidth={1.4} opacity={0.4} />

      {visible.map((item, i) => {
        const y = BOARD.y + 54 + i * 25;
        const label = truncate(item.text, 30);
        const textWidth = Math.min(200, label.length * 6.4);
        return (
          <g key={item.id}>
            <rect x={BOARD.x + 14} y={y - 10} width={12} height={12} rx={2} fill="none" stroke="#2b2b33" strokeWidth={1.6} />
            {item.done && (
              <path
                d={`M${BOARD.x + 16} ${y - 4} l 4 4 l 8 -11`}
                fill="none"
                stroke="#3f8f5a"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <text
              x={BOARD.x + 34}
              y={y}
              fontFamily="Nunito"
              fontWeight={700}
              fontSize={12}
              fill={item.done ? '#8b8b93' : '#26262e'}
            >
              {label}
            </text>
            {item.done && (
              <path
                key={`strike-${item.updatedAt}`}
                d={`M${BOARD.x + 32} ${y - 4} q ${textWidth / 2} -3, ${textWidth + 4} 1`}
                fill="none"
                stroke="#d1495b"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeDasharray={300}
                style={{ animation: 'jp-strike 420ms ease-out both' }}
              />
            )}
          </g>
        );
      })}
      {items.length > MAX_LINES && (
        <text x={BOARD.x + 34} y={BOARD.y + BOARD.h - 6} fontFamily="Nunito" fontSize={10} fill="#7a6a5e">
          +{items.length - MAX_LINES} more…
        </text>
      )}
      {/* marker tray */}
      <rect x={BOARD.x + 70} y={BOARD.y + BOARD.h + 6} width={120} height={8} rx={3} fill="#5b4332" />
      <rect x={BOARD.x + 90} y={BOARD.y + BOARD.h + 1} width={30} height={6} rx={3} fill="#d1495b" />
      <rect x={BOARD.x + 126} y={BOARD.y + BOARD.h + 1} width={30} height={6} rx={3} fill="#2f5b8f" />
    </g>
  );
}
