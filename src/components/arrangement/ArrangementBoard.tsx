import { useState, type DragEvent } from 'react';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { SECTION_COLORS, SECTION_KINDS, SECTION_LABEL } from '../../lib/sections';
import { cx, formatTime, uid } from '../../lib/utils';
import type { ArrangementBlock, SectionKind } from '../../types';

const DRAG_BLOCK = 'application/x-jampod-block';
const DRAG_KIND = 'application/x-jampod-kind';

/**
 * Module 3 — collaborative, zero-stress arrangement sandbox. Every move,
 * duplicate, pin, and 👍 is a replicated action, so the board stays in sync.
 */
export function ArrangementBoard({ bpm = 96 }: { bpm?: number }) {
  const { shared, dispatchShared, me, members } = useUserPreferences();
  const blocks = shared.arrangement;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [paletteOver, setPaletteOver] = useState(false);

  const totalBars = blocks.reduce((n, b) => n + b.bars, 0);
  const barSec = (60 / bpm) * 4;

  const addBlock = (kind: SectionKind) => {
    const count = blocks.filter((b) => b.kind === kind).length;
    const label = kind === 'verse' || kind === 'chorus' ? `${SECTION_LABEL[kind]}${kind === 'verse' ? ` ${count + 1}` : ''}` : SECTION_LABEL[kind];
    dispatchShared({
      type: 'arr/add',
      block: { id: uid('ab'), kind, label, bars: kind === 'intro' || kind === 'outro' ? 4 : 8, votes: [], pinned: false },
    });
  };

  const onDragStart = (b: ArrangementBlock) => (e: DragEvent) => {
    if (b.pinned) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_BLOCK, b.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(b.id);
  };

  const onDropOn = (target: ArrangementBlock) => (e: DragEvent) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData(DRAG_BLOCK);
    const kind = e.dataTransfer.getData(DRAG_KIND) as SectionKind;
    if (fromId && fromId !== target.id) dispatchShared({ type: 'arr/move', fromId, toId: target.id });
    else if (kind) addBlock(kind);
    setDragId(null);
    setOverId(null);
  };

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '?';

  return (
    <section className="flex flex-col gap-4" aria-labelledby="arr-title">
      <div className="jp-card flex flex-wrap items-end gap-4 p-4">
        <div>
          <p className="jp-label">Arrangement board</p>
          <h2 id="arr-title" className="font-display text-2xl font-bold">
            Sketch the shape, together
          </h2>
          <p className="text-xs text-muted">
            Drag to re-order · duplicate a chorus · pin what’s settled · 👍 what feels good. No right answers.
          </p>
        </div>
        <div className="ml-auto text-right font-mono text-xs text-muted">
          <div>
            {blocks.length} blocks · {totalBars} bars
          </div>
          <div>
            ≈ {formatTime(totalBars * barSec)} @ {bpm} BPM
          </div>
        </div>

        {/* Mini timeline */}
        <div className="flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
          {blocks.map((b) => (
            <div key={b.id} style={{ flexGrow: b.bars, background: SECTION_COLORS[b.kind].bg }} className="border-r border-bg/60 last:border-0" />
          ))}
        </div>
      </div>

      {/* Palette */}
      <div
        className={cx('jp-card flex flex-wrap items-center gap-2 p-3', paletteOver && 'ring-2 ring-danger/60')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_BLOCK)) {
            e.preventDefault();
            setPaletteOver(true);
          }
        }}
        onDragLeave={() => setPaletteOver(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(DRAG_BLOCK);
          if (id) dispatchShared({ type: 'arr/remove', id });
          setPaletteOver(false);
          setDragId(null);
        }}
      >
        <span className="jp-label mr-1">{paletteOver ? 'Drop to remove' : 'Add section'}</span>
        {SECTION_KINDS.map((k) => (
          <button
            key={k}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DRAG_KIND, k)}
            onClick={() => addBlock(k)}
            className="rounded-full px-3 py-1 text-xs font-extrabold transition hover:-translate-y-0.5"
            style={{ background: SECTION_COLORS[k].bg, color: SECTION_COLORS[k].fg }}
          >
            + {SECTION_LABEL[k]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <ol data-tour="arrange-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Song arrangement blocks">
        {blocks.map((b, i) => {
          const c = SECTION_COLORS[b.kind];
          const voted = b.votes.includes(me.id);
          return (
            <li
              key={b.id}
              draggable={!b.pinned}
              onDragStart={onDragStart(b)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(b.id);
              }}
              onDragLeave={() => setOverId((o) => (o === b.id ? null : o))}
              onDrop={onDropOn(b)}
              className={cx(
                'group relative flex min-h-[132px] flex-col rounded-2xl p-3 shadow-studio transition',
                b.pinned ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                dragId === b.id && 'scale-95 opacity-40',
                overId === b.id && dragId !== b.id && 'ring-4 ring-ink/40',
              )}
              style={{ background: c.bg, color: c.fg }}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] font-medium opacity-70">#{String(i + 1).padStart(2, '0')}</span>
                {b.pinned && (
                  <span className="text-sm" title="Pinned — locked in place" aria-label="Pinned">
                    📌
                  </span>
                )}
              </div>
              <p className="mt-1 font-display text-xl leading-tight font-bold">{b.label}</p>
              <p className="text-xs font-bold opacity-75">{b.bars} bars</p>

              <div className="mt-auto flex items-center gap-1 pt-3">
                <button
                  onClick={() => dispatchShared({ type: 'arr/vote', id: b.id, by: me.id })}
                  aria-pressed={voted}
                  title={b.votes.length ? `Liked by ${b.votes.map(nameOf).join(', ')}` : 'Give it a thumbs up'}
                  className={cx(
                    'relative flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold transition',
                    voted ? 'bg-black/80 text-white' : 'bg-black/15 hover:bg-black/25',
                  )}
                >
                  👍
                  <span key={b.votes.length} className="inline-block tabular-nums" style={{ animation: 'jp-fade-up 240ms ease-out' }}>
                    {b.votes.length}
                  </span>
                </button>
                <div className="ml-auto flex gap-0.5 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
                  <BlockBtn label="Duplicate" onClick={() => dispatchShared({ type: 'arr/duplicate', id: b.id, newId: uid('ab') })}>
                    ⧉
                  </BlockBtn>
                  <BlockBtn label={b.pinned ? 'Unpin' : 'Pin'} onClick={() => dispatchShared({ type: 'arr/pin', id: b.id })}>
                    {b.pinned ? '⊘' : '📌'}
                  </BlockBtn>
                  <BlockBtn
                    label="Move left"
                    disabled={i === 0 || b.pinned || blocks[i - 1].pinned}
                    onClick={() => dispatchShared({ type: 'arr/move', fromId: b.id, toId: blocks[i - 1].id })}
                  >
                    ←
                  </BlockBtn>
                  <BlockBtn
                    label="Move right"
                    disabled={i === blocks.length - 1 || b.pinned || blocks[i + 1].pinned}
                    onClick={() => dispatchShared({ type: 'arr/move', fromId: b.id, toId: blocks[i + 1].id })}
                  >
                    →
                  </BlockBtn>
                  <BlockBtn label="Remove" disabled={b.pinned} onClick={() => dispatchShared({ type: 'arr/remove', id: b.id })}>
                    ✕
                  </BlockBtn>
                </div>
              </div>
              {/* floating voter dots */}
              {b.votes.length > 0 && (
                <div className="absolute -top-2 right-3 flex -space-x-1">
                  {b.votes.slice(0, 4).map((v) => (
                    <span
                      key={v}
                      className="size-4 rounded-full border-2 border-bg"
                      style={{ background: members.find((m) => m.id === v)?.tint ?? '#999' }}
                      title={nameOf(v)}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BlockBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-6 place-items-center rounded-md text-xs font-bold hover:bg-black/15 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
