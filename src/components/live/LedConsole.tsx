import { useState } from 'react';
import { LED_PRESETS, useUserPreferences } from '../../context/UserPreferencesContext';
import { cx, rgba } from '../../lib/utils';
import type { RGBA } from '../../types';

const CHANNELS: Array<{ key: keyof Omit<RGBA, 'a'>; label: string; track: string }> = [
  { key: 'r', label: 'R', track: 'linear-gradient(90deg,#2a1414,#ff4d4d)' },
  { key: 'g', label: 'G', track: 'linear-gradient(90deg,#142a18,#4dff7a)' },
  { key: 'b', label: 'B', track: 'linear-gradient(90deg,#141a2a,#4d7aff)' },
];

/** Analog-style RGB fader deck that drives the room's `ledColor`. */
export function LedConsole({ compact = false }: { compact?: boolean }) {
  const { ledColor, setLedColor } = useUserPreferences();
  const [open, setOpen] = useState(false);

  const activePreset = Object.entries(LED_PRESETS).find(
    ([, p]) => p.color.r === ledColor.r && p.color.g === ledColor.g && p.color.b === ledColor.b,
  )?.[0];

  const deck = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {CHANNELS.map((ch) => (
          <label key={ch.key} className="flex items-center gap-1.5">
            <span className="w-3 font-mono text-[11px] font-bold text-muted">{ch.label}</span>
            <input
              type="range"
              min={0}
              max={255}
              value={ledColor[ch.key]}
              onChange={(e) => setLedColor({ ...ledColor, [ch.key]: Number(e.target.value) })}
              className="jp-fader w-20 lg:w-24"
              style={{ ['--track' as string]: ch.track }}
              aria-label={`LED ${ch.label} channel`}
            />
            <span className="w-7 text-right font-mono text-[10px] tabular-nums text-muted">{ledColor[ch.key]}</span>
          </label>
        ))}
        <label className="flex items-center gap-1.5" title="Brightness">
          <span className="font-mono text-[11px] text-muted">☀</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={ledColor.a}
            onChange={(e) => setLedColor({ ...ledColor, a: Number(e.target.value) })}
            className="jp-fader w-14"
            aria-label="LED intensity"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(LED_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => setLedColor(preset.color)}
            className={cx(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition',
              activePreset === key ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink',
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: rgba(preset.color, 1), boxShadow: `0 0 8px ${rgba(preset.color, 1)}` }} />
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );

  if (!compact) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-bg/40 px-3 py-2">
        <div className="flex flex-col items-center gap-1">
          <span className="jp-label">LED</span>
          <span
            className="size-5 rounded-full border border-line"
            style={{ background: rgba(ledColor, 1), boxShadow: `0 0 14px ${rgba(ledColor)}` }}
          />
        </div>
        {deck}
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="jp-btn" aria-expanded={open}>
        <span className="size-3 rounded-full" style={{ background: rgba(ledColor, 1), boxShadow: `0 0 8px ${rgba(ledColor)}` }} />
        LED
      </button>
      {open && (
        <div className="jp-card jp-fade-up absolute right-0 z-40 mt-2 p-3">
          {deck}
        </div>
      )}
    </div>
  );
}
