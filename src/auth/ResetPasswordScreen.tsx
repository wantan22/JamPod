import { useState, type FormEvent } from 'react';
import { useSession } from './SessionContext';

/** Opened from the emailed link (/?reset=<token>). Sets a new password and signs in. */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { resetPassword } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="relative z-10 flex min-h-full items-center justify-center p-4">
      <form onSubmit={(e) => void submit(e)} className="jp-card flex w-full max-w-md flex-col gap-4 p-6" noValidate>
        <img src="/jampod-logo.webp" alt="" className="mx-auto size-16 rounded-2xl shadow-studio" />
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted">You’ll be signed in here, and signed out everywhere else.</p>
        </div>
        <label className="block">
          <span className="flex items-baseline justify-between">
            <span className="jp-label">New password</span>
            <button type="button" onClick={() => setShow((s) => !s)} className="text-[11px] font-bold text-muted hover:text-ink">
              {show ? 'Hide' : 'Show'}
            </button>
          </span>
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            className="jp-input mt-1.5"
          />
        </label>
        <label className="block">
          <span className="jp-label">Type it again</span>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className="jp-input mt-1.5"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="jp-btn-accent py-2.5 text-base">
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        <button type="button" onClick={onDone} className="text-center text-sm font-bold text-muted hover:text-ink">
          Cancel
        </button>
      </form>
    </main>
  );
}
