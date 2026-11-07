import { useEffect, useRef, useState } from 'react';
import type { SheetNote, Song } from '../../context/LibraryContext';
import { cx } from '../../lib/utils';

type Tab = 'lyrics' | 'chords' | 'sheet';

interface TeleprompterProps {
  song: Song;
  locked: boolean;
  onToggleLock: () => void;
  compact?: boolean;
}

/** Shared lyrics / chord chart / sheet music view with optional auto-scroll. */
export function Teleprompter({ song, locked, onToggleLock, compact = false }: TeleprompterProps) {
  const [tab, setTab] = useState<Tab>('lyrics');
  const [scrolling, setScrolling] = useState(false);
  const [speed, setSpeed] = useState(18);
  const [fontScale, setFontScale] = useState(1);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrolling) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const el = body.current;
      if (!el) return;
      el.scrollTop += ((now - last) / 1000) * speed;
      last = now;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setScrolling(false);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scrolling, speed]);

  return (
    <section className="jp-card flex flex-col p-4" aria-label={`Teleprompter: ${song.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-xl border border-line bg-bg/50 p-1">
          {(['lyrics', 'chords', 'sheet'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx('rounded-lg px-3 py-1 text-xs font-bold capitalize', tab === t ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}
            >
              {t === 'sheet' ? 'Sheet' : t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setFontScale((s) => Math.max(0.8, s - 0.1))} className="jp-btn px-2 text-xs" aria-label="Smaller text">
            A−
          </button>
          <button onClick={() => setFontScale((s) => Math.min(1.8, s + 0.1))} className="jp-btn px-2 text-xs" aria-label="Larger text">
            A+
          </button>
          <button onClick={() => setScrolling((s) => !s)} className={cx('jp-btn text-xs', scrolling && 'border-accent text-accent')}>
            {scrolling ? '❚❚ Scroll' : '▶ Scroll'}
          </button>
          <input
            type="range"
            min={6}
            max={60}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="jp-fader w-16"
            aria-label="Auto-scroll speed"
          />
          <button
            onClick={onToggleLock}
            aria-pressed={locked}
            className={cx('jp-btn text-xs', locked && 'bg-accent-soft text-accent')}
            title={locked ? 'Unlock from Band Room layout' : 'Lock into the Band Room layout'}
          >
            {locked ? '🔒 Locked' : '🔓 Lock to layout'}
          </button>
        </div>
      </div>

      <div
        ref={body}
        className={cx('mt-3 overflow-y-auto rounded-xl bg-bg/50 p-4', compact ? 'max-h-56' : 'max-h-[420px]')}
        style={{ fontSize: `${fontScale}rem` }}
      >
        {tab === 'lyrics' && <Lyrics text={song.lyrics} />}
        {tab === 'chords' && <ChordChart song={song} />}
        {tab === 'sheet' && <SheetMusic notes={song.sheet} title={song.title} />}
      </div>
    </section>
  );
}

function Lyrics({ text }: { text: string }) {
  return (
    <div className="space-y-1 leading-relaxed">
      {text.split('\n').map((line, i) =>
        /^\[.*\]$/.test(line.trim()) ? (
          <p key={i} className="pt-3 font-mono text-[0.7em] tracking-[0.2em] text-accent uppercase first:pt-0">
            {line.replace(/[[\]]/g, '')}
          </p>
        ) : line.trim() === '' ? (
          <div key={i} className="h-1" />
        ) : (
          <p key={i} className="font-semibold">
            {line}
          </p>
        ),
      )}
    </div>
  );
}

function ChordChart({ song }: { song: Song }) {
  return (
    <div className="space-y-3">
      {song.sections.map((sec) => (
        <div key={sec.id}>
          <p className="font-mono text-[0.7em] tracking-[0.2em] text-accent uppercase">{sec.label}</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {Array.from({ length: sec.bars }, (_, b) => {
              const chord = song.progression[(sec.startBar + b) % song.progression.length];
              return (
                <div key={b} className="rounded-lg border border-line bg-surface px-2 py-2 font-display text-[1.2em] font-bold">
                  {chord}
                  <span className="ml-1 font-mono text-[0.5em] text-muted">| / / / |</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/** Treble-clef staff rendering of a simple melody line. */
function SheetMusic({ notes, title }: { notes: SheetNote[]; title: string }) {
  const lineGap = 10;
  const top = 40;
  const bottomLineY = top + lineGap * 4; // E4
  const stepToY = (pitch: string) => {
    const m = pitch.match(/^([A-G])#?(\d)$/);
    if (!m) return bottomLineY;
    const step = STEP[m[1]] + Number(m[2]) * 7;
    const e4 = STEP.E + 4 * 7;
    return bottomLineY - (step - e4) * (lineGap / 2);
  };
  let x = 70;
  let beat = 0;
  const items: Array<{ x: number; y: number; beats: number; pitch: string } | { bar: number }> = [];
  notes.forEach((n) => {
    items.push({ x, y: stepToY(n.pitch), beats: n.beats, pitch: n.pitch });
    x += 26 + n.beats * 14;
    beat += n.beats;
    if (beat % 4 === 0) {
      items.push({ bar: x - 12 });
      x += 6;
    }
  });
  const width = Math.max(320, x + 20);

  return (
    <svg viewBox={`0 0 ${width} 120`} className="w-full text-ink" role="img" aria-label={`Sheet music melody for ${title}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={10} x2={width - 10} y1={top + i * lineGap} y2={top + i * lineGap} stroke="currentColor" strokeOpacity={0.55} />
      ))}
      <text x={14} y={top + 36} fontSize={52} fill="currentColor" fontFamily="serif">
        𝄞
      </text>
      <text x={48} y={top + 15} fontSize={16} fontFamily="Fraunces" fontWeight={700} fill="currentColor">
        4
      </text>
      <text x={48} y={top + 35} fontSize={16} fontFamily="Fraunces" fontWeight={700} fill="currentColor">
        4
      </text>
      {items.map((it, i) =>
        'bar' in it ? (
          <line key={i} x1={it.bar} x2={it.bar} y1={top} y2={top + lineGap * 4} stroke="currentColor" strokeOpacity={0.7} />
        ) : (
          <g key={i}>
            {/* ledger line for middle C and above A5 */}
            {it.y > bottomLineY + lineGap / 2 && <line x1={it.x - 9} x2={it.x + 9} y1={it.y} y2={it.y} stroke="currentColor" />}
            {it.y < top - lineGap / 2 && <line x1={it.x - 9} x2={it.x + 9} y1={it.y} y2={it.y} stroke="currentColor" />}
            <ellipse
              cx={it.x}
              cy={it.y}
              rx={6.2}
              ry={4.4}
              transform={`rotate(-20 ${it.x} ${it.y})`}
              fill={it.beats >= 2 ? 'none' : 'currentColor'}
              stroke="currentColor"
              strokeWidth={1.6}
            />
            {it.beats < 4 && (
              <line
                x1={it.y < top + lineGap * 2 ? it.x - 5.6 : it.x + 5.6}
                x2={it.y < top + lineGap * 2 ? it.x - 5.6 : it.x + 5.6}
                y1={it.y}
                y2={it.y < top + lineGap * 2 ? it.y + 30 : it.y - 30}
                stroke="currentColor"
                strokeWidth={1.4}
              />
            )}
            <text x={it.x} y={top + lineGap * 4 + 30} textAnchor="middle" fontSize={9} fontFamily="IBM Plex Mono" fill="currentColor" opacity={0.55}>
              {it.pitch}
            </text>
          </g>
        ),
      )}
      <line x1={width - 14} x2={width - 14} y1={top} y2={top + lineGap * 4} stroke="currentColor" strokeWidth={3} />
    </svg>
  );
}
