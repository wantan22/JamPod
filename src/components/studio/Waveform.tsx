import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { clamp, formatTime } from '../../lib/utils';

interface WaveformProps {
  peaks: number[];
  color: string;
  trimStart: number;
  trimEnd: number;
  duration: number;
  /** Playhead as fraction of THIS stem (null = hide). */
  playFrac: number | null;
  onTrimCommit: (start: number, end: number) => void;
  onSeek?: (frac: number) => void;
}

const MIN_GAP = 0.02;

/**
 * Canvas waveform with draggable left/right trim brackets. Dragging is
 * local (smooth 60fps), and the result is committed on pointer-up.
 */
export function Waveform({ peaks, color, trimStart, trimEnd, duration, playFrac, onTrimCommit, onSeek }: WaveformProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [local, setLocal] = useState({ start: trimStart, end: trimEnd });
  const dragging = useRef<'start' | 'end' | null>(null);

  useEffect(() => {
    if (!dragging.current) setLocal({ start: trimStart, end: trimEnd });
  }, [trimStart, trimEnd]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const h = 56;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, h);
    if (!peaks.length) return;
    const bar = width / peaks.length;
    for (let i = 0; i < peaks.length; i++) {
      const f = i / peaks.length;
      const inside = f >= local.start && f <= local.end;
      const amp = Math.max(1, peaks[i] * (h / 2 - 3));
      g.fillStyle = inside ? color : 'rgba(150,150,160,0.35)';
      g.fillRect(i * bar, h / 2 - amp, Math.max(1, bar - 0.6), amp * 2);
    }
  }, [peaks, width, color, local.start, local.end]);

  const fracFromEvent = (e: { clientX: number }) => {
    const rect = wrap.current!.getBoundingClientRect();
    return clamp((e.clientX - rect.left) / rect.width, 0, 1);
  };

  const onHandleDown = (which: 'start' | 'end') => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = which;
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const f = fracFromEvent(e);
    setLocal((cur) =>
      dragging.current === 'start'
        ? { ...cur, start: clamp(f, 0, cur.end - MIN_GAP) }
        : { ...cur, end: clamp(f, cur.start + MIN_GAP, 1) },
    );
  };

  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = null;
    onTrimCommit(local.start, local.end);
  };

  const nudge = (which: 'start' | 'end', delta: number) => {
    const next =
      which === 'start'
        ? { start: clamp(local.start + delta, 0, local.end - MIN_GAP), end: local.end }
        : { start: local.start, end: clamp(local.end + delta, local.start + MIN_GAP, 1) };
    setLocal(next);
    onTrimCommit(next.start, next.end);
  };

  return (
    <div
      ref={wrap}
      className="relative h-14 w-full touch-none rounded-lg bg-bg/60"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => onSeek?.(fracFromEvent(e))}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />

      {/* trimmed-out shading */}
      <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-black/30" style={{ width: `${local.start * 100}%` }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-black/30" style={{ width: `${(1 - local.end) * 100}%` }} />

      {(['start', 'end'] as const).map((which) => {
        const f = which === 'start' ? local.start : local.end;
        return (
          <div
            key={which}
            role="slider"
            tabIndex={0}
            aria-label={`Trim ${which}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(f * 100)}
            aria-valuetext={formatTime(f * duration)}
            onPointerDown={onHandleDown(which)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') nudge(which, -0.01);
              if (e.key === 'ArrowRight') nudge(which, 0.01);
            }}
            className="group absolute inset-y-[-3px] z-10 w-3 -translate-x-1/2 cursor-ew-resize outline-none"
            style={{ left: `${f * 100}%` }}
          >
            <div
              className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full group-focus-visible:ring-2 group-focus-visible:ring-accent"
              style={{ background: color }}
            />
            <div
              className="absolute top-0 h-2 w-2.5 rounded-sm"
              style={{ background: color, [which === 'start' ? 'left' : 'right']: '50%' }}
            />
            <div
              className="absolute bottom-0 h-2 w-2.5 rounded-sm"
              style={{ background: color, [which === 'start' ? 'left' : 'right']: '50%' }}
            />
          </div>
        );
      })}

      {playFrac !== null && playFrac >= 0 && playFrac <= 1 && (
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink/90" style={{ left: `${playFrac * 100}%` }} />
      )}
      <span className="pointer-events-none absolute right-1.5 bottom-0.5 font-mono text-[9px] text-muted">
        {formatTime((local.end - local.start) * duration)}
      </span>
    </div>
  );
}
