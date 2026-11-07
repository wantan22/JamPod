import { useState, type DragEvent } from 'react';
import { useJamBus } from '../../context/JamBusContext';
import { useLibrary } from '../../context/LibraryContext';
import { cx } from '../../lib/utils';

const DRAG_SONG = 'application/x-jampod-song';
const DRAG_ENTRY = 'application/x-jampod-entry';

interface SetlistBuilderProps {
  onLoaded: () => void;
}

/** Sidebar: drag songs into setlist folders, reorder, and gapless-load. */
export function SetlistBuilder({ onLoaded }: SetlistBuilderProps) {
  const { songs, setlists, dispatch, createSetlist, preloadSetlist, queue } = useLibrary();
  const { socket } = useJamBus();
  const [newName, setNewName] = useState('');
  const [over, setOver] = useState<{ list: string; index: number } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const titleOf = (id: string) => songs.find((s) => s.id === id)?.title ?? 'Unknown song';

  const onDrop = (listId: string, index: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const songId = e.dataTransfer.getData(DRAG_SONG);
    const entry = e.dataTransfer.getData(DRAG_ENTRY);
    if (songId) dispatch({ type: 'setlist/insert', id: listId, songId, index });
    else if (entry) {
      const [fromId, fromIndex] = entry.split('|');
      dispatch({ type: 'setlist/move', fromId, fromIndex: Number(fromIndex), toId: listId, toIndex: index });
    }
    setOver(null);
  };

  const load = async (listId: string) => {
    setLoading(listId);
    const n = await preloadSetlist(listId);
    dispatch({ type: 'queue/load', setlistId: listId });
    const name = setlists.find((l) => l.id === listId)?.name;
    socket.log(`Gapless-loaded "${name}" — ${n} stems pre-buffered`, 'studio', 'you');
    setLoading(null);
    onLoaded();
  };

  return (
    <aside data-tour="vault-setlists" className="flex flex-col gap-4" aria-label="Setlist and playlist builder">
      <div className="jp-card p-3">
        <p className="jp-label mb-2">Library · drag into a folder</p>
        <ul className="space-y-1">
          {songs.map((s) => (
            <li
              key={s.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_SONG, s.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-bg/40 px-2.5 py-1.5 text-sm font-semibold active:cursor-grabbing"
            >
              <span className="text-muted" aria-hidden>
                ⠿
              </span>
              <span className="flex-1 truncate">{s.title}</span>
              <span className="font-mono text-[10px] text-muted">{s.bpm}</span>
            </li>
          ))}
        </ul>
      </div>

      {setlists.map((list) => {
        const isOpen = !collapsed[list.id];
        const active = queue?.setlistId === list.id;
        return (
          <div
            key={list.id}
            className={cx('jp-card p-3', active && 'ring-2 ring-accent/70')}
            onDragOver={(e) => {
              e.preventDefault();
              if (!over || over.list !== list.id) setOver({ list: list.id, index: list.songIds.length });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={onDrop(list.id, list.songIds.length)}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [list.id]: !c[list.id] }))}
                className="text-muted"
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${list.name}`}
              >
                {isOpen ? '📂' : '📁'}
              </button>
              <input
                value={list.name}
                onChange={(e) => dispatch({ type: 'setlist/rename', id: list.id, name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-extrabold outline-none focus:underline"
                aria-label="Folder name"
              />
              <span className="font-mono text-[10px] text-muted">{list.songIds.length}</span>
            </div>

            {isOpen && (
              <ol className="mt-2 space-y-1">
                {list.songIds.length === 0 && (
                  <li className="rounded-lg border border-dashed border-line px-2 py-3 text-center text-[11px] text-muted">Drop songs here</li>
                )}
                {list.songIds.map((songId, i) => (
                  <li
                    key={`${songId}-${i}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_ENTRY, `${list.id}|${i}`);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOver({ list: list.id, index: i });
                    }}
                    onDrop={onDrop(list.id, i)}
                    className={cx(
                      'flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition',
                      over?.list === list.id && over.index === i ? 'border-t-2 border-accent' : 'border-t-2 border-transparent',
                      active && queue?.index === i ? 'bg-accent-soft font-bold' : 'bg-bg/40',
                    )}
                  >
                    <span className="w-4 font-mono text-[10px] text-muted">{i + 1}</span>
                    <span className="flex-1 truncate">{titleOf(songId)}</span>
                    <button
                      onClick={() => dispatch({ type: 'setlist/remove', id: list.id, index: i })}
                      className="text-xs text-muted hover:text-danger"
                      aria-label={`Remove ${titleOf(songId)} from ${list.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {over?.list === list.id && over.index === list.songIds.length && list.songIds.length > 0 && (
                  <li className="h-0.5 rounded bg-accent" aria-hidden />
                )}
              </ol>
            )}

            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => void load(list.id)}
                disabled={!list.songIds.length || loading === list.id}
                className="jp-btn-accent flex-1 py-1 text-xs"
              >
                {loading === list.id ? 'Buffering…' : active ? '↻ Reload session' : '▶ Load session (gapless)'}
              </button>
              <button onClick={() => dispatch({ type: 'setlist/delete', id: list.id })} className="jp-btn px-2 py-1 text-xs" aria-label={`Delete ${list.name}`}>
                🗑
              </button>
            </div>
          </div>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createSetlist(newName.trim());
          setNewName('');
        }}
        className="flex gap-1.5"
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder…" className="jp-input py-1.5" />
        <button className="jp-btn shrink-0">+ Folder</button>
      </form>
    </aside>
  );
}
