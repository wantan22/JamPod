import { useEffect, useState } from 'react';
import { useSession } from '../../auth/SessionContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { cx } from '../../lib/utils';
import type { GenderPreset } from '../../types';
import { ROLE_META } from '../../types';
import { Character } from '../stage/Character';

const GENDERS: Array<{ id: GenderPreset; label: string; hint: string }> = [
  { id: 'masculine', label: 'Masculine', hint: 'Short crop' },
  { id: 'feminine', label: 'Feminine', hint: 'Long hair + bow' },
  { id: 'nonbinary', label: 'Non-binary', hint: 'Curls + beanie' },
];

const TINTS = ['#E8B464', '#C79BD8', '#7FB7BE', '#E07A5F', '#8FB996', '#F2C6A0', '#9AA8E8', '#D98FA6'];

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Slide-in drawer: edit your display name, avatar preset, and tint; manage your account. */
export function ProfileDrawer({ open, onClose }: ProfileDrawerProps) {
  const { me, members, updateProfile } = useUserPreferences();
  const session = useSession();
  const [name, setName] = useState(me.displayName);
  const [error, setError] = useState<string | null>(null);

  /** Profile edits save to the account first; the room then updates for everyone. */
  const save = (patch: Parameters<typeof updateProfile>[0]) => {
    setError(null);
    updateProfile(patch).catch((e: Error) => {
      setError(e.message);
      setName(me.displayName);
    });
  };

  const leaveBand = () => {
    const band = session.activeBand;
    if (!band) return;
    if (!window.confirm(`Leave ${band.name}? You'll need its invite code (${band.inviteCode}) to rejoin.`)) return;
    void session.leaveBand(band.id).catch((e: Error) => setError(e.message));
  };

  useEffect(() => setName(me.displayName), [me.displayName, me.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const commitName = () => {
    const clean = name.trim().slice(0, 16);
    if (clean && clean !== me.displayName) save({ displayName: clean });
    else setName(me.displayName);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <button className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-label="Close profile drawer" onClick={onClose} />
      <aside className="jp-drawer absolute top-0 right-0 flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="profile-title" className="font-display text-2xl font-bold">
            Your bandmate
          </h2>
          <button onClick={onClose} className="jp-btn" aria-label="Close">
            ✕
          </button>
        </div>

        {/* live preview */}
        <div className="mt-4 grid place-items-center rounded-2xl border border-line bg-bg/60 py-4">
          <svg viewBox="-80 -190 160 200" className="h-44 w-auto" aria-label="Avatar preview">
            <Character member={me} walking={false} holding={me.role === 'bass' || me.role === 'guitar' ? me.role : null} facing={1} />
            <text x={0} y={-160} textAnchor="middle" fontFamily="Nunito" fontWeight={800} fontSize={16} fill={me.tint}>
              {name || me.displayName}
            </text>
          </svg>
          <p className="jp-label">
            {ROLE_META[me.role].player} station
          </p>
        </div>

        <label className="mt-5 block">
          <span className="jp-label">Display name (floats over your station)</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="jp-input mt-1.5"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="jp-label">Character style</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {GENDERS.map((g) => (
              <button
                key={g.id}
                aria-pressed={me.gender === g.id}
                onClick={() => save({ gender: g.id })}
                className={cx(
                  'rounded-xl border p-2 text-left transition',
                  me.gender === g.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel',
                )}
              >
                <svg viewBox="-42 -140 84 64" className="mx-auto h-12 w-auto" aria-hidden>
                  <Character member={{ ...me, gender: g.id }} walking={false} holding={null} facing={1} />
                </svg>
                <span className="block text-xs font-bold">{g.label}</span>
                <span className="block text-[10px] text-muted">{g.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="jp-label">Shirt / name-tag tint</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TINTS.map((c) => (
              <button
                key={c}
                aria-label={`Tint ${c}`}
                aria-pressed={me.tint.toLowerCase() === c.toLowerCase()}
                onClick={() => save({ tint: c })}
                className={cx(
                  'size-8 rounded-full border-2 transition',
                  me.tint.toLowerCase() === c.toLowerCase() ? 'scale-110 border-ink' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">
            {error}
          </p>
        )}

        <section className="mt-6" aria-labelledby="band-title">
          <h3 id="band-title" className="jp-label">
            {session.activeBand?.name ?? 'This band'} · invite code{' '}
            <span className="font-mono text-ink">{session.activeBand?.inviteCode}</span>
          </h3>
          <ul className="mt-2 space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2 text-sm', m.id === me.id ? 'border-accent bg-accent-soft' : 'border-line')}>
                <span className="size-3 rounded-full" style={{ background: m.tint }} />
                <span className="flex-1 font-bold">{m.displayName}</span>
                <span className="text-xs text-muted">
                  {ROLE_META[m.role].emoji} {ROLE_META[m.role].label}
                </span>
                {m.id === me.id && <span className="text-[10px] font-extrabold text-accent">YOU</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-auto pt-6" aria-labelledby="account-title">
          <h3 id="account-title" className="jp-label">
            Account · {session.user?.email}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={session.exitRoom} className="jp-btn">
              ⇦ Switch room
            </button>
            <button onClick={() => void session.logout()} className="jp-btn">
              Log out
            </button>
          </div>
          <button onClick={leaveBand} className="mt-2 w-full rounded-xl px-3 py-1.5 text-xs font-bold text-muted hover:bg-danger/10 hover:text-danger">
            Leave this band
          </button>
        </section>
      </aside>
    </div>
  );
}
