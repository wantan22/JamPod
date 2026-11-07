import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Band } from './auth/api';
import { AuthScreen } from './auth/AuthScreen';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen';
import { RoomPicker } from './auth/RoomPicker';
import { useSession } from './auth/SessionContext';
import { JamPodDashboard } from './components/JamPodDashboard';
import { CompanionView } from './components/live/CompanionView';
import { UserPreferencesProvider, useThemePreference, type RosterEntry } from './context/UserPreferencesContext';

/** Read once at startup, then strip from the address bar. */
const initialParams = new URLSearchParams(window.location.search);
const INVITE = initialParams.get('invite')?.trim().toUpperCase() || null;
const COMPANION_ROOM = initialParams.has('companion') ? initialParams.get('room') : null;
const DEEP_LINK_ROOM = initialParams.get('room');
const RESET_TOKEN = initialParams.get('reset');

const clearParams = (...keys: string[]) => {
  const url = new URL(window.location.href);
  keys.forEach((k) => url.searchParams.delete(k));
  window.history.replaceState(null, '', url.toString());
};

/**
 * App flow:
 *   restore session (cookie) → log in / register if needed
 *   → accept a pending ?invite= → pick a band room → the studio for that band.
 * The phone companion page skips the picker and binds to its ?room=.
 */
export function App() {
  const session = useSession();
  useThemePreference(); // apply the saved theme before any room is open
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(RESET_TOKEN);
  const handledLinks = useRef(false);

  // Keep the reset token out of the address bar (and browser history) once read.
  useEffect(() => {
    if (RESET_TOKEN) clearParams('reset');
  }, []);

  // One-time: accept an invite link, or follow a ?room= deep link.
  useEffect(() => {
    if (session.status !== 'signedIn' || handledLinks.current) return;
    handledLinks.current = true;
    if (INVITE) {
      clearParams('invite');
      session
        .joinBand(INVITE)
        .then((band) => session.enterRoom(band.id))
        .catch((e: Error) => setInviteError(e.message));
    } else if (DEEP_LINK_ROOM && !COMPANION_ROOM) {
      clearParams('room');
      if (session.bands.some((b) => b.id === DEEP_LINK_ROOM)) session.enterRoom(DEEP_LINK_ROOM);
    }
  }, [session]);

  if (session.status === 'loading') return <Splash text="Tuning up…" />;
  // A reset link works whether or not this browser is already signed in.
  if (resetToken && session.status !== 'offline') {
    return <ResetPasswordScreen token={resetToken} onDone={() => setResetToken(null)} />;
  }
  if (session.status === 'offline') {
    return (
      <Splash text="Can’t reach the JamPod server.">
        <button onClick={session.retry} className="jp-btn-accent mt-4">
          Try again
        </button>
      </Splash>
    );
  }
  if (session.status === 'signedOut') return <AuthScreen inviteCode={INVITE} />;

  if (COMPANION_ROOM) {
    const band = session.bands.find((b) => b.id === COMPANION_ROOM);
    if (!band) return <Splash text="This phone’s account isn’t in that band. Log in with the same account you use on your laptop." />;
    return (
      <BandRoom band={band}>
        <CompanionView />
      </BandRoom>
    );
  }

  if (!session.activeBand) {
    return (
      <>
        {inviteError && (
          <p role="alert" className="relative z-20 mx-auto mt-4 max-w-5xl rounded-xl bg-danger/15 px-4 py-2 text-sm font-semibold text-danger">
            Couldn’t use that invite: {inviteError}
          </p>
        )}
        <RoomPicker />
      </>
    );
  }

  return (
    <BandRoom band={session.activeBand}>
      <JamPodDashboard />
    </BandRoom>
  );
}

/** Mounts a fresh room state per band (key = band id). */
function BandRoom({ band, children }: { band: Band; children: ReactNode }) {
  const { user, updateProfile } = useSession();

  const roster = useMemo<RosterEntry[]>(
    () => band.members.map((m) => ({ seat: m.seat, displayName: m.displayName, gender: m.gender, tint: m.tint })),
    [band.members],
  );
  const myProfile = useMemo<RosterEntry>(
    () => ({
      seat: band.seat ?? 'm1',
      displayName: user?.displayName ?? 'Me',
      gender: user?.gender ?? 'nonbinary',
      tint: user?.tint ?? '#E8B464',
    }),
    [band.seat, user?.displayName, user?.gender, user?.tint],
  );
  const onProfileChange = useCallback((patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch), [updateProfile]);

  return (
    <UserPreferencesProvider key={band.id} roomId={band.id} roster={roster} myProfile={myProfile} onProfileChange={onProfileChange}>
      {children}
    </UserPreferencesProvider>
  );
}

function Splash({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <main className="relative z-10 flex min-h-full flex-col items-center justify-center p-6 text-center">
      <img src="/jampod-logo.webp" alt="JamPod" className="size-20 animate-pulse rounded-3xl" />
      <p className="mt-4 max-w-sm text-sm text-muted">{text}</p>
      {children}
    </main>
  );
}
