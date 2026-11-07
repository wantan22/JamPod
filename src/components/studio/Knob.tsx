import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp } from '../../lib/utils';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  color?: string;
  onChange: (v: number) => void;
}

/**
 * Analog rotary knob. Drag vertically, scroll, or use arrow keys.
 * Double-click resets to center (0 dB).
 */
export function Knob({ label, value, min, max, step = 0.5, unit = 'dB', color = 'var(--jp-accent)', onChange }: KnobProps) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const frac = (value - min) / (max - min);
  const angle = -135 + frac * 270;
  const set = (v: number) => onChange(Math.round(clamp(v, min, max) / step) * step);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    set(drag.current.v + (dy / 120) * (max - min));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      set(value + step);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      set(value - step);
    } else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
  };

  // arc path for value indicator
  const r = 15;
  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [18 + r * Math.cos(rad), 18 + r * Math.sin(rad)];
  };
  const zeroDeg = -135 + ((0 - min) / (max - min)) * 270;
  const [sx, sy] = polar(Math.min(zeroDeg, angle));
  const [ex, ey] = polar(Math.max(zeroDeg, angle));
  const large = Math.abs(angle - zeroDeg) > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value > 0 ? '+' : ''}${value} ${unit}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => set(value + (e.deltaY < 0 ? step : -step))}
        onDoubleClick={() => set(0)}
        onKeyDown={onKey}
        className="relative size-9 cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title={`${label}: ${value > 0 ? '+' : ''}${value} ${unit} (double-click to reset)`}
      >
        <svg viewBox="0 0 36 36" className="size-full">
          <circle cx={18} cy={18} r={r} fill="none" stroke="var(--jp-panel-2)" strokeWidth={3} strokeDasharray="70.7 23.6" transform="rotate(135 18 18)" />
          {angle !== zeroDeg && (
            <path d={`M${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
          )}
          <circle cx={18} cy={18} r={10.5} fill="url(#knobGrad)" stroke="rgba(0,0,0,.35)" />
          <defs>
            <radialGradient id="knobGrad" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#f6efe0" />
              <stop offset="100%" stopColor="#8f846f" />
            </radialGradient>
          </defs>
          <line x1={18} y1={18} x2={18} y2={9.5} stroke="#1d1626" strokeWidth={2.2} strokeLinecap="round" transform={`rotate(${angle} 18 18)`} />
        </svg>
      </div>
      <span className="font-mono text-[9px] tracking-wider text-muted uppercase">{label}</span>
    </div>
  );
}
