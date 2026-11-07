import { useSyncExternalStore } from 'react';
import type { ImportedMedia, RGBA } from '../../types';
import { chordAt } from '../../lib/chords';
import { playhead } from '../../lib/playhead';
import { cx, formatTime, rgba } from '../../lib/utils';

interface ChordHighwayProps {
  media: ImportedMedia | null;
  ledColor: RGBA;
  liveChord: { name: string; confidence: number };
  micLive: boolean;
  emphasized: boolean;
}

const PX_PER_SEC = 92;
const NOW_PCT = 0.22;
const VIEW_SECONDS = 12;

/**
 * Scrolling teleprompter lane that floats above the stage. Chords slide
 * right→left past a fixed "now" line, locked to the backing track playhead.
 */
export function ChordHighway({ media, ledColor, liveChord, micLive, emphasized }: ChordHighwayProps) {
  const { t, playing } = useSyncExternalStore(playhead.subscribe, playhead.get);

  if (!media) {
    return (
      <div className="flex h-[88px] items-center justify-between gap-4 rounded-2xl border border-dashed border-line bg-bg/40 px-5">
        <div>
          <p className="jp-label">Chord teleprompter</p>
          <p className="mt-1 text-sm text-muted">Drop an MP3 or paste a YouTube link in the Media Dock to light up the highway.</p>
        </div>
        <div className="text-right">
          <p className="jp-label">Live from your mic</p>
          <p className={cx('font-display text-3xl font-bold', micLive ? 'text-accent' : 'text-muted/60')}>
            {micLive ? liveChord.name : 'mic off'}
          </p>
        </div>
      </div>
    );
  }

  const idx = chordAt(media.chords, t);
  const current = idx >= 0 ? media.chords[idx] : null;
  const next = media.chords[idx + 1];
  const beatLen = 60 / media.bpm;
  const startBeat = Math.floor((t - VIEW_SECONDS * NOW_PCT) / beatLen);
  const endBeat = Math.ceil((t + VIEW_SECONDS) / beatLen);
  const visible = media.chords.filter((c) => c.t + c.d > t - VIEW_SECONDS * NOW_PCT && c.t < t + VIEW_SECONDS);
  const progressToNext = current ? Math.min(1, (t - current.t) / current.d) : 0;

  return (
    <div
      className={cx(
        'relative h-[88px] overflow-hidden rounded-2xl border bg-[#0d0c11] transition-shadow duration-500',
        emphasized ? 'border-accent/60' : 'border-line',
      )}
      style={{ boxShadow: emphasized ? `0 0 40px -10px ${rgba(ledColor)}` : undefined }}
      aria-live="polite"
      aria-label={`Current chord ${current?.chord ?? 'none'}${next ? `, next ${next.chord}` : ''}`}
    >
      {/* lane */}
      <div className="absolute inset-0" style={{ containerType: 'inline-size' }}>
        {Array.from({ length: Math.max(0, endBeat - startBeat) }, (_, i) => {
          const beat = startBeat + i;
          const x = (beat * beatLen - t) * PX_PER_SEC;
          return (
            <div
              key={beat}
              className={cx('absolute top-0 bottom-0 w-px', beat % 4 === 0 ? 'bg-white/15' : 'bg-white/5')}
              style={{ left: `calc(${NOW_PCT * 100}% + ${x}px)` }}
            />
          );
        })}
        {visible.map((c) => {
          const x = (c.t - t) * PX_PER_SEC;
          const w = Math.max(28, c.d * PX_PER_SEC - 6);
          const isCurrent = c === current;
          return (
            <div
              key={`${c.t}-${c.chord}`}
              className={cx(
                'absolute top-3 bottom-3 flex items-center rounded-xl border px-3 font-display text-xl font-bold whitespace-nowrap',
                isCurrent ? 'text-[#1b1408]' : 'text-[#ede6d6]',
              )}
              style={{
                left: `calc(${NOW_PCT * 100}% + ${x}px)`,
                width: w,
                background: isCurrent ? rgba(ledColor, 1) : 'rgba(255,255,255,0.06)',
                borderColor: isCurrent ? 'transparent' : 'rgba(255,255,255,0.12)',
                boxShadow: isCurrent ? `0 0 24px ${rgba(ledColor)}` : undefined,
              }}
            >
              {c.chord}
            </div>
          );
        })}
      </div>

      {/* now line */}
      <div className="pointer-events-none absolute top-0 bottom-0 w-[3px] rounded bg-[#ede6d6]" style={{ left: `${NOW_PCT * 100}%` }} />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[22%] bg-gradient-to-r from-[#0d0c11] via-[#0d0c11]/80 to-transparent" />

      {/* readout */}
      <div className="pointer-events-none absolute top-2 left-3 flex flex-col">
        <span className="font-mono text-[9px] tracking-[0.2em] text-[#9aa3b5] uppercase">Now</span>
        <span className="font-display text-3xl leading-none font-bold text-[#ede6d6]">{current?.chord ?? '—'}</span>
        <span className="mt-1 h-1 w-14 overflow-hidden rounded bg-white/10">
          <span className="block h-full rounded" style={{ width: `${progressToNext * 100}%`, background: rgba(ledColor, 1) }} />
        </span>
      </div>
      <div className="pointer-events-none absolute top-2 right-3 text-right font-mono text-[10px] text-[#9aa3b5]">
        <div>
          {playing ? '▶' : '❚❚'} {formatTime(t)} / {formatTime(media.duration)}
        </div>
        <div>{media.bpm} BPM · next {next?.chord ?? '—'}</div>
      </div>
    </div>
  );
}
