import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, type AccountUser, type Band, type MePayload } from './api';

/* ------------------------------------------------------------------ */
/*  Session: who is signed in, which bands they're in, which room      */
/*  they've chosen. The login itself lives in an HttpOnly cookie, so    */
/*  re-opening the site restores it automatically via GET /api/me.      */
/* ------------------------------------------------------------------ */

type Status = 'loading' | 'signedOut' | 'signedIn' | 'offline';

export interface SessionValue {
  status: Status;
  user: AccountUser | null;
  bands: Band[];
  activeBand: Band | null;
  lastBandId: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<AccountUser, 'displayName' | 'gender' | 'tint'>>) => Promise<void>;
  createBand: (name: string) => Promise<Band>;
  joinBand: (code: string) => Promise<Band>;
  leaveBand: (bandId: string) => Promise<void>;
  enterRoom: (bandId: string) => void;
  exitRoom: () => void;
  retry: () => void;
}

const LAST_ROOM_KEY = 'jampod.lastRoom';
const readLast = () => {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MePayload | null>(null);
  const [activeBandId, setActiveBandId] = useState<string | null>(null);
  const [lastBandId, setLastBandId] = useState<string | null>(readLast);
  const [attempt, setAttempt] = useState(0);

  const apply = useCallback((payload: MePayload) => {
    setMe(payload);
    setStatus('signedIn');
  }, []);

  const signedOut = useCallback(() => {
    setMe(null);
    setActiveBandId(null);
    setStatus('signedOut');
  }, []);

  /** Wraps calls that need a session: a 401 means the cookie expired. */
  const authed = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signedOut();
        throw e;
      }
    },
    [signedOut],
  );

  // Restore the session on every visit.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api
      .me()
      .then((p) => alive && apply(p))
      .catch((e) => alive && (e instanceof ApiError && e.status === 0 ? setStatus('offline') : signedOut()));
    return () => {
      alive = false;
    };
  }, [apply, signedOut, attempt]);

  const enterRoom = useCallback((bandId: string) => {
    setActiveBandId(bandId);
    setLastBandId(bandId);
    try {
      localStorage.setItem(LAST_ROOM_KEY, bandId);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<SessionValue>(() => {
    const bands = me?.bands ?? [];
    return {
      status,
      user: me?.user ?? null,
      bands,
      activeBand: bands.find((b) => b.id === activeBandId) ?? null,
      lastBandId,
      login: async (email, password) => apply(await api.login(email, password)),
      register: async (email, password, displayName) => apply(await api.register(email, password, displayName)),
      logout: async () => {
        await api.logout().catch(() => undefined);
        signedOut();
      },
      updateProfile: async (patch) => apply(await authed(() => api.updateMe(patch))),
      createBand: async (name) => {
        const r = await authed(() => api.createBand(name));
        apply(r);
        return r.band;
      },
      joinBand: async (code) => {
        const r = await authed(() => api.joinBand(code));
        apply(r);
        return r.band;
      },
      leaveBand: async (bandId) => {
        apply(await authed(() => api.leaveBand(bandId)));
        if (activeBandId === bandId) setActiveBandId(null);
      },
      enterRoom,
      exitRoom: () => setActiveBandId(null),
      retry: () => setAttempt((n) => n + 1),
    };
  }, [status, me, activeBandId, lastBandId, apply, signedOut, authed, enterRoom]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
