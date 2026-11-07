import { useState, type FormEvent } from 'react';
import { ROLE_META } from '../types';
import { SEAT_ROLE } from '../context/UserPreferencesContext';
import { cx, timeAgo } from '../lib/utils';
import type { Band } from './api';
import { useSession } from './SessionContext';

/** After sign-in: pick which band's jam room to enter, or start/join one. */
export function RoomPicker() {
  const { user, bands, lastBandId, enterRoom, createBand, joinBand, logout } = useSession();
  const [bandName, setBandName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<{ form: 'create' | 'join'; message: string } | null>(null);

  const ordered = [...bands].sort((a, b) => (a.id === lastBandId ? -1 : b.id === lastBandId ? 1 : 0));

  const run = async (form: 'create' | 'join', fn: () => Promise<Band>) => {
    setBusy(form);
    setError(null);
    try {
      const band = await fn();
      enterRoom(band.id);
    } catch (e) {
      setError({ form, message: (e as Error).message });
      setBusy(null);
    }
  };

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (bandName.trim()) void run('create', () => createBand(bandName.trim()));
  };
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) void run('join', () => joinBand(code.trim()));
  };

  return (
    <main className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <img src="/jampod-logo.webp" alt="" className="size-12 rounded-2xl shadow-studio" />
        <div>
          <p className="jp-label">Signed in as {user?.email}</p>
          <h1 className="font-display text-2xl font-bold">Hey {user?.displayName}, which band today?</h1>
        </div>
        <button onClick={() => void logout()} className="jp-btn ml-auto">
          Log out
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="bands-title">
          <h2 id="bands-title" className="jp-label mb-3">
            Your jam rooms · {bands.length}
          </h2>

          {bands.length === 0 ? (
            <div className="jp-card grid place-items-center gap-2 p-10 text-center">
              <span className="text-4xl" aria-hidden>
                🎸
              </span>
              <p className="font-display text-xl font-bold">No bands yet</p>
              <p className="max-w-sm text-sm text-muted">
                Start a band and share its invite code, or paste a code a bandmate sent you. You can be in as many bands as you like.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {ordered.map((band) => {
                const role = band.seat ? SEAT_ROLE[band.seat] : null;
                const last = band.id === lastBandId;
                return (
                  <li key={band.id}>
                    <button
                      onClick={() => enterRoom(band.id)}
                      className={cx(
                        'jp-card group flex h-full w-full flex-col p-4 text-left transition hover:-translate-y-0.5',
                        last && 'ring-2 ring-accent/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display text-xl leading-tight font-bold">{band.name}</span>
                        {last && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold text-accent">LAST VISITED</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {role ? `You play ${ROLE_META[role].label.toLowerCase()} ${ROLE_META[role].emoji}` : 'Member'} · started{' '}
                        {timeAgo(band.createdAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {band.members.map((m) => (
                          <span key={m.userId} className="flex items-center gap-1.5 rounded-full bg-bg/60 py-0.5 pr-2.5 pl-1 text-xs font-semibold">
                            <span className="grid size-5 place-items-center rounded-full text-[10px] font-extrabold text-[#1d1626]" style={{ background: m.tint }}>
                              {m.displayName.slice(0, 1).toUpperCase()}
                            </span>
                            {m.displayName}
                          </span>
                        ))}
                        {Array.from({ length: Math.max(0, 4 - band.members.length) }, (_, i) => (
                          <span key={`open-${i}`} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted">
                            open seat
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted">invite code {band.inviteCode}</span>
                        <span className="rounded-xl bg-accent px-3 py-1.5 text-sm font-bold text-accent-ink transition group-hover:brightness-110">
                          Enter room →
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <form onSubmit={onCreate} className="jp-card flex flex-col gap-3 p-4">
            <h2 className="font-display text-lg font-bold">Start a new band</h2>
            <input
              value={bandName}
              onChange={(e) => setBandName(e.target.value)}
              maxLength={40}
              placeholder="e.g. The Paper Lanterns"
              className="jp-input"
              aria-label="Band name"
            />
            {error?.form === 'create' && <p role="alert" className="text-xs font-semibold text-danger">{error.message}</p>}
            <button type="submit" disabled={!bandName.trim() || busy !== null} className="jp-btn-accent">
              {busy === 'create' ? 'Creating…' : 'Create & enter'}
            </button>
            <p className="text-[11px] text-muted">You’ll get an invite code to share. Up to 4 members, one per stage station.</p>
          </form>

          <form onSubmit={onJoin} className="jp-card flex flex-col gap-3 p-4">
            <h2 className="font-display text-lg font-bold">Join with a code</h2>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="ABC123"
              className="jp-input text-center font-mono text-lg tracking-[0.3em] uppercase"
              aria-label="Invite code"
              autoCapitalize="characters"
            />
            {error?.form === 'join' && <p role="alert" className="text-xs font-semibold text-danger">{error.message}</p>}
            <button type="submit" disabled={code.trim().length < 6 || busy !== null} className="jp-btn">
              {busy === 'join' ? 'Joining…' : 'Join band'}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
