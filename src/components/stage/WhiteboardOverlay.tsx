import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { cx, timeAgo } from '../../lib/utils';

interface WhiteboardOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** Full notepad view of the wall whiteboard. Every edit is broadcast live. */
export function WhiteboardOverlay({ open, onClose }: WhiteboardOverlayProps) {
  const {
    whiteboard,
    members,
    addWhiteboardItem,
    toggleWhiteboardItem,
    editWhiteboardItem,
    removeWhiteboardItem,
    moveWhiteboardItem,
    clearCompletedWhiteboard,
  } = useUserPreferences();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '—';
  const tintOf = (id: string) => members.find((m) => m.id === id)?.tint ?? '#999';
  const done = whiteboard.filter((w) => w.done).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    addWhiteboardItem(draft);
    setDraft('');
  };

  const commitEdit = () => {
    if (editingId && editText.trim()) editWhiteboardItem(editingId, editText.trim());
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="wb-title">
      <button aria-label="Close whiteboard" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="jp-fade-up relative w-full max-w-xl overflow-hidden rounded-2xl border-[10px] border-[#8a6a4f] bg-[#fbfaf5] text-[#26262e] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#2f5b8f]/20 px-5 pt-4 pb-3">
          <div>
            <h2 id="wb-title" className="font-display text-2xl font-bold text-[#2f5b8f]">
              Session Goals
            </h2>
            <p className="mt-0.5 text-xs text-[#7a6a5e]">
              Shared live with the band · {done}/{whiteboard.length} crossed off · no scores, just vibes
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-bold text-[#7a6a5e] hover:bg-black/5">
            Esc ✕
          </button>
        </div>

        <ul className="max-h-[52vh] space-y-1 overflow-y-auto px-3 py-3">
          {whiteboard.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-[#7a6a5e]">Board is clean. Jot down what you want to play today.</li>
          )}
          {whiteboard.map((item, idx) => (
            <li key={item.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-black/[0.03]">
              <button
                role="checkbox"
                aria-checked={item.done}
                aria-label={`Mark "${item.text}" ${item.done ? 'not done' : 'done'}`}
                onClick={() => toggleWhiteboardItem(item.id)}
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-md border-2 transition',
                  item.done ? 'border-[#3f8f5a] bg-[#3f8f5a]/10' : 'border-[#2b2b33] hover:border-[#2f5b8f]',
                )}
              >
                {item.done && (
                  <svg viewBox="0 0 16 16" className="size-4">
                    <path d="M3 8.5 L6.5 12 L13 4" fill="none" stroke="#3f8f5a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              <div className="min-w-0 flex-1">
                {editingId === item.id ? (
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    className="w-full rounded-md border border-[#2f5b8f]/40 bg-white px-2 py-1 text-[15px] font-bold outline-none"
                  />
                ) : (
                  <button
                    className="relative block max-w-full text-left text-[15px] font-bold"
                    onDoubleClick={() => {
                      setEditingId(item.id);
                      setEditText(item.text);
                    }}
                    title="Double-click to edit"
                  >
                    <span className={cx('transition-colors', item.done && 'text-[#8b8b93]')}>{item.text}</span>
                    {item.done && (
                      <svg className="pointer-events-none absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 10">
                        <path
                          key={item.updatedAt}
                          d="M0 6 Q 50 2, 100 5"
                          fill="none"
                          stroke="#d1495b"
                          strokeWidth={2.5}
                          vectorEffect="non-scaling-stroke"
                          strokeLinecap="round"
                          strokeDasharray={300}
                          style={{ animation: 'jp-strike 420ms ease-out both' }}
                        />
                      </svg>
                    )}
                  </button>
                )}
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#7a6a5e]">
                  <span className="inline-block size-2 rounded-full" style={{ background: tintOf(item.updatedBy) }} />
                  {nameOf(item.updatedBy)} · {timeAgo(item.updatedAt)}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
                <IconBtn label="Move up" disabled={idx === 0} onClick={() => moveWhiteboardItem(item.id, -1)}>
                  ↑
                </IconBtn>
                <IconBtn label="Move down" disabled={idx === whiteboard.length - 1} onClick={() => moveWhiteboardItem(item.id, 1)}>
                  ↓
                </IconBtn>
                <IconBtn
                  label="Edit"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditText(item.text);
                  }}
                >
                  ✎
                </IconBtn>
                <IconBtn label="Erase" onClick={() => removeWhiteboardItem(item.id)}>
                  ✕
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={submit} className="flex gap-2 border-t border-[#2f5b8f]/20 bg-[#f4f1ea] px-4 py-3">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a song or goal… e.g. 'Run the bridge twice'"
            className="min-w-0 flex-1 rounded-xl border border-[#2f5b8f]/25 bg-white px-3 py-2 text-sm outline-none focus:border-[#2f5b8f]"
          />
          <button type="submit" className="rounded-xl bg-[#2f5b8f] px-4 py-2 text-sm font-bold text-white hover:brightness-110">
            Add
          </button>
          <button
            type="button"
            onClick={clearCompletedWhiteboard}
            disabled={done === 0}
            className="rounded-xl px-3 py-2 text-xs font-bold text-[#7a6a5e] hover:bg-black/5 disabled:opacity-40"
          >
            Wipe done
          </button>
        </form>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 place-items-center rounded-md text-sm text-[#5b4332] hover:bg-black/5 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
