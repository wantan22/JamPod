import { useEffect, useState } from 'react';
import type { ActivityEntry } from '../../types';
import { cx, timeAgo } from '../../lib/utils';

const ICON: Record<ActivityEntry['kind'], string> = {
  socket: '⇄',
  audio: '♪',
  studio: '◉',
  room: '●',
  device: '📱',
};

interface ActivityLogProps {
  entries: ActivityEntry[];
  status: string;
  transport: string;
  latencyMs: number | null;
}

/** Rolling, human-readable session feed (socket, audio, studio, device events). */
export function ActivityLog({ entries, status, transport, latencyMs }: ActivityLogProps) {
  const [filter, setFilter] = useState<ActivityEntry['kind'] | 'all'>('all');
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);

  return (
    <section className="jp-card flex min-h-0 flex-col p-4" aria-labelledby="activity-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="activity-title" className="font-display text-lg font-bold">
          Session Feed
        </h3>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
          <span className={cx('size-2 rounded-full', status === 'open' ? 'bg-ok' : status === 'connecting' ? 'bg-accent' : 'bg-danger')} />
          {transport} · {latencyMs !== null ? `${latencyMs}ms` : '—'}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Filter feed">
        {(['all', 'room', 'audio', 'studio', 'socket'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cx(
              'rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
              filter === k ? 'bg-accent text-accent-ink' : 'bg-panel text-muted hover:text-ink',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      <ol className="mt-2 max-h-64 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-live="polite">
        {shown.length === 0 && <li className="py-6 text-center text-xs text-muted">Quiet in here. Play something.</li>}
        {shown.map((e) => (
          <li key={e.id} className="jp-fade-up flex gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-panel/50">
            <span className="w-4 shrink-0 text-center text-muted" aria-hidden>
              {ICON[e.kind]}
            </span>
            <span className="min-w-0 flex-1">
              {e.who === 'remote' && <span className="mr-1 font-bold text-accent">↓</span>}
              {e.text}
            </span>
            <time className="shrink-0 font-mono text-[10px] text-muted" dateTime={new Date(e.at).toISOString()}>
              {timeAgo(e.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
