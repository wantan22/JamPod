import { useState, type FormEvent } from 'react';
import { cx } from '../lib/utils';
import { useSession } from './SessionContext';

type Mode = 'login' | 'register';

/** Log in / create account. Shown only when there's no saved session. */
export function AuthScreen({ inviteCode }: { inviteCode: string | null }) {
  const { login, register } = useSession();
  const [mode, setMode] = useState<Mode>(inviteCode ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <main className="relative z-10 flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/jampod-logo.webp" alt="JamPod" className="size-24 rounded-3xl shadow-studio" />
          <h1 className="mt-4 font-display text-3xl font-bold">
            Jam<span className="text-accent">Pod</span>
          </h1>
          <p className="mt-1 text-sm text-muted">Your band’s practice room, without the studio bill.</p>
        </div>

        {inviteCode && (
          <p className="mb-3 rounded-xl bg-accent-soft px-4 py-3 text-center text-sm">
            🎟️ You’ve been invited to a band. {mode === 'register' ? 'Create an account' : 'Log in'} and you’ll join right
            away.
          </p>
        )}

        <div className="jp-card p-6">
          <div role="tablist" aria-label="Account" className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-bg/50 p-1">
            {(
              [
                ['login', 'Log in'],
                ['register', 'Create account'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cx('rounded-lg py-2 text-sm font-bold transition', mode === m ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
            {mode === 'register' && (
              <label className="block">
                <span className="jp-label">Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={16}
                  required
                  autoComplete="nickname"
                  placeholder="What the band calls you"
                  className="jp-input mt-1.5"
                />
              </label>
            )}
            <label className="block">
              <span className="jp-label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                className="jp-input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="flex items-baseline justify-between">
                <span className="jp-label">Password</span>
                {mode === 'register' && <span className="text-[11px] text-muted">At least 8 characters</span>}
              </span>
              <span className="relative mt-1.5 block">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="jp-input pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-bold text-muted hover:text-ink"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm font-semibold text-danger">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="jp-btn-accent py-2.5 text-base">
              {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted">
            You’ll stay signed in on this device until you log out.
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'login' ? 'First time here? ' : 'Already have an account? '}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="font-bold text-accent hover:underline">
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </div>
    </main>
  );
}
