import { useLibrary, type Song, type SongVersion } from '../../context/LibraryContext';
import { cx, timeAgo } from '../../lib/utils';

interface VersionTreeProps {
  onOpenInStudio: () => void;
}

/** Nested historical tree of every song's versions; click to hot-swap stems. */
export function VersionTree({ onOpenInStudio }: VersionTreeProps) {
  const { songs, activeSongId, activeVersionId, dispatch } = useLibrary();

  const select = (song: Song, v: SongVersion) => {
    if (song.id !== activeSongId) dispatch({ type: 'song/select', songId: song.id });
    dispatch({ type: 'version/select', versionId: v.id });
  };

  const renderBranch = (song: Song, parentId: string | null, depth: number) =>
    song.versions
      .filter((v) => v.parentId === parentId)
      .map((v) => {
        const active = song.id === activeSongId && v.id === activeVersionId;
        const stemCount = Object.keys(v.stems).length;
        const published = Object.values(v.stems).filter((s) => s?.published).length;
        return (
          <li key={v.id}>
            <div className="relative flex items-stretch" style={{ paddingLeft: depth * 18 }}>
              {depth > 0 && (
                <span aria-hidden className="absolute top-0 h-1/2 w-3 rounded-bl-md border-b-2 border-l-2 border-line" style={{ left: depth * 18 - 12 }} />
              )}
              <button
                onClick={() => select(song, v)}
                aria-current={active}
                className={cx(
                  'my-0.5 flex flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left transition',
                  active ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-panel/60',
                )}
              >
                <span className={cx('size-2.5 shrink-0 rounded-full', active ? 'bg-accent' : 'bg-muted/40')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{v.label}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {v.note || 'No note'} · {timeAgo(v.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {stemCount} stems{published ? ` · ${published}☁` : ''}
                </span>
              </button>
              {active && (
                <button
                  onClick={onOpenInStudio}
                  className="my-auto ml-2 shrink-0 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-extrabold text-accent-ink"
                >
                  Open in Studio ▸
                </button>
              )}
            </div>
            <ul>{renderBranch(song, v.id, depth + 1)}</ul>
          </li>
        );
      });

  return (
    <div className="flex flex-col gap-4">
      {songs.map((song) => (
        <div key={song.id} className="jp-card p-3">
          <div className="mb-1 flex items-baseline justify-between px-1">
            <h3 className="font-display text-lg font-bold">{song.title}</h3>
            <span className="font-mono text-[10px] text-muted">
              {song.key} · {song.bpm} BPM · {song.versions.length} versions
            </span>
          </div>
          <ul aria-label={`${song.title} versions`}>{renderBranch(song, null, 0)}</ul>
        </div>
      ))}
    </div>
  );
}
