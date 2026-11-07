import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ArrangementBlock,
  CommMode,
  CompanionLink,
  GenderPreset,
  InstrumentRole,
  MemberProfile,
  RGBA,
  SectionKind,
  SharedRoomState,
  ThemeMode,
  WhiteboardItem,
} from '../types';
import { clamp, uid } from '../lib/utils';

/* ------------------------------------------------------------------ */
/*  Presets & seed data                                                */
/* ------------------------------------------------------------------ */

export const LED_PRESETS: Record<'lofiSunset' | 'rockArena' | 'acousticWarmth', { label: string; color: RGBA }> = {
  lofiSunset: { label: 'Lofi Sunset', color: { r: 255, g: 128, b: 110, a: 0.85 } },
  rockArena: { label: 'Rock Arena', color: { r: 214, g: 38, b: 64, a: 0.95 } },
  acousticWarmth: { label: 'Acoustic Warmth', color: { r: 255, g: 186, b: 108, a: 0.75 } },
};

/** Each band seat starts at its own stage station. */
export const SEAT_ROLE: Record<string, InstrumentRole> = { m1: 'drums', m2: 'keys', m3: 'bass', m4: 'guitar' };

/** A band member as the room should first see them (from the account roster). */
export interface RosterEntry {
  seat: string;
  displayName: string;
  gender: GenderPreset;
  tint: string;
}

const toMember = (r: RosterEntry, role?: InstrumentRole): MemberProfile => ({
  id: r.seat,
  displayName: r.displayName,
  gender: r.gender,
  tint: r.tint,
  role: role ?? SEAT_ROLE[r.seat] ?? 'guitar',
  isSinging: false,
  online: false,
});

const starterWhiteboard = (by: string): WhiteboardItem[] => [
  { id: 'wb_start_1', text: 'Say hi 👋 and tune up', done: false, updatedBy: by, updatedAt: Date.now() },
  { id: 'wb_start_2', text: 'Pick today’s first song', done: false, updatedBy: by, updatedAt: Date.now() },
];

const block = (id: string, kind: SectionKind, label: string, bars: number, votes: string[] = []): ArrangementBlock => ({
  id,
  kind,
  label,
  bars,
  votes,
  pinned: false,
});

const SEED_ARRANGEMENT: ArrangementBlock[] = [
  block('ab_1', 'intro', 'Intro', 4),
  block('ab_2', 'verse', 'Verse 1', 8),
  block('ab_3', 'chorus', 'Chorus', 8),
  block('ab_4', 'verse', 'Verse 2', 8),
  block('ab_5', 'chorus', 'Chorus', 8),
  block('ab_6', 'solo', 'Guitar Solo', 8),
  block('ab_7', 'outro', 'Outro', 4),
];

/**
 * Starting point before bandmates send us the live room state. The room's
 * live state lives with whoever is connected; the first person in sees this.
 */
export const createInitialSharedState = (roster: RosterEntry[], mySeat: string): SharedRoomState => ({
  members: roster.map((r) => toMember(r)),
  whiteboard: starterWhiteboard(mySeat),
  ledColor: LED_PRESETS.lofiSunset.color,
  commMode: 'jam',
  arrangement: SEED_ARRANGEMENT,
  companion: null,
});

/* ------------------------------------------------------------------ */
/*  Shared (replicated) actions                                        */
/* ------------------------------------------------------------------ */

type MemberPatch = Partial<Pick<MemberProfile, 'displayName' | 'gender' | 'tint' | 'online'>>;

export type SharedAction =
  | { type: 'member/update'; id: string; patch: MemberPatch }
  /** Add me to the room if missing, or refresh my name/look. Keeps my current instrument. */
  | { type: 'member/join'; member: RosterEntry }
  | { type: 'role/swap'; id: string; role: InstrumentRole }
  | { type: 'singing/set'; id: string; on: boolean }
  | { type: 'comm/set'; mode: CommMode }
  | { type: 'led/set'; color: RGBA }
  | { type: 'wb/add'; item: WhiteboardItem }
  | { type: 'wb/toggle'; id: string; by: string; at: number }
  | { type: 'wb/edit'; id: string; text: string; by: string; at: number }
  | { type: 'wb/remove'; id: string }
  | { type: 'wb/move'; id: string; dir: -1 | 1 }
  | { type: 'wb/clearDone' }
  | { type: 'arr/move'; fromId: string; toId: string }
  | { type: 'arr/duplicate'; id: string; newId: string }
  | { type: 'arr/remove'; id: string }
  | { type: 'arr/add'; block: ArrangementBlock }
  | { type: 'arr/vote'; id: string; by: string }
  | { type: 'arr/pin'; id: string }
  | { type: 'companion/set'; link: CompanionLink | null }
  | { type: 'sync/replace'; state: SharedRoomState };

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * Pure + deterministic: every client runs the same reducer on the same
 * action stream, so ids/timestamps are always minted *before* dispatch.
 */
export function sharedReducer(state: SharedRoomState, action: SharedAction): SharedRoomState {
  switch (action.type) {
    case 'member/update':
      return {
        ...state,
        members: state.members.map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      };

    case 'member/join': {
      const { member } = action;
      const existing = state.members.find((m) => m.id === member.seat);
      if (existing) {
        const patch = { displayName: member.displayName, gender: member.gender, tint: member.tint };
        return {
          ...state,
          members: state.members.map((m) => (m.id === member.seat ? { ...m, ...patch } : m)),
        };
      }
      const taken = new Set(state.members.map((m) => m.role));
      const preferred = SEAT_ROLE[member.seat];
      const role = preferred && !taken.has(preferred) ? preferred : (['drums', 'keys', 'bass', 'guitar'] as const).find((r) => !taken.has(r));
      return { ...state, members: [...state.members, toMember(member, role ?? preferred)] };
    }

    case 'role/swap': {
      const mover = state.members.find((m) => m.id === action.id);
      if (!mover || mover.role === action.role) return state;
      const occupant = state.members.find((m) => m.role === action.role);
      return {
        ...state,
        members: state.members.map((m) => {
          if (m.id === mover.id) return { ...m, role: action.role };
          if (occupant && m.id === occupant.id) return { ...m, role: mover.role };
          return m;
        }),
      };
    }

    case 'singing/set':
      return {
        ...state,
        members: state.members.map((m) => (m.id === action.id ? { ...m, isSinging: action.on } : m)),
      };

    case 'comm/set':
      return {
        ...state,
        commMode: action.mode,
        companion: state.companion ? { ...state.companion, micLive: action.mode === 'talk' } : null,
      };

    case 'led/set':
      return {
        ...state,
        ledColor: {
          r: clamp(action.color.r, 0, 255),
          g: clamp(action.color.g, 0, 255),
          b: clamp(action.color.b, 0, 255),
          a: clamp(action.color.a, 0, 1),
        },
      };

    case 'wb/add':
      if (state.whiteboard.some((w) => w.id === action.item.id)) return state;
      return { ...state, whiteboard: [...state.whiteboard, action.item] };

    case 'wb/toggle':
      return {
        ...state,
        whiteboard: state.whiteboard.map((w) =>
          w.id === action.id ? { ...w, done: !w.done, updatedBy: action.by, updatedAt: action.at } : w,
        ),
      };

    case 'wb/edit':
      return {
        ...state,
        whiteboard: state.whiteboard.map((w) =>
          w.id === action.id ? { ...w, text: action.text, updatedBy: action.by, updatedAt: action.at } : w,
        ),
      };

    case 'wb/remove':
      return { ...state, whiteboard: state.whiteboard.filter((w) => w.id !== action.id) };

    case 'wb/move': {
      const idx = state.whiteboard.findIndex((w) => w.id === action.id);
      return { ...state, whiteboard: moveItem(state.whiteboard, idx, idx + action.dir) };
    }

    case 'wb/clearDone':
      return { ...state, whiteboard: state.whiteboard.filter((w) => !w.done) };

    case 'arr/move': {
      const from = state.arrangement.findIndex((b) => b.id === action.fromId);
      const to = state.arrangement.findIndex((b) => b.id === action.toId);
      if (from < 0 || to < 0 || state.arrangement[from].pinned || state.arrangement[to].pinned) return state;
      return { ...state, arrangement: moveItem(state.arrangement, from, to) };
    }

    case 'arr/duplicate': {
      const idx = state.arrangement.findIndex((b) => b.id === action.id);
      if (idx < 0) return state;
      const src = state.arrangement[idx];
      const next = state.arrangement.slice();
      next.splice(idx + 1, 0, { ...src, id: action.newId, votes: [], pinned: false });
      return { ...state, arrangement: next };
    }

    case 'arr/remove':
      return { ...state, arrangement: state.arrangement.filter((b) => b.id !== action.id || b.pinned) };

    case 'arr/add':
      if (state.arrangement.some((b) => b.id === action.block.id)) return state;
      return { ...state, arrangement: [...state.arrangement, action.block] };

    case 'arr/vote':
      return {
        ...state,
        arrangement: state.arrangement.map((b) =>
          b.id !== action.id
            ? b
            : {
                ...b,
                votes: b.votes.includes(action.by) ? b.votes.filter((v) => v !== action.by) : [...b.votes, action.by],
              },
        ),
      };

    case 'arr/pin':
      return {
        ...state,
        arrangement: state.arrangement.map((b) => (b.id === action.id ? { ...b, pinned: !b.pinned } : b)),
      };

    case 'companion/set':
      return { ...state, companion: action.link };

    case 'sync/replace':
      return action.state;

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Context contract                                                   */
/* ------------------------------------------------------------------ */

export type OutboundListener = (action: SharedAction) => void;

export interface UserPreferencesValue {
  /* local-only preferences */
  theme: ThemeMode;
  toggleTheme: () => void;
  /** The band's id doubles as its relay room id. */
  roomChannelId: string;
  /** My seat in this band (m1–m4), which is also my member id in the room. */
  localMemberId: string;

  /* replicated room state */
  shared: SharedRoomState;
  me: MemberProfile;
  activeRole: InstrumentRole;
  members: MemberProfile[];
  whiteboard: WhiteboardItem[];
  ledColor: RGBA;
  commMode: CommMode;
  isSinging: boolean;

  /* intent helpers (all broadcast to bandmates) */
  /** Saves to my account; the room picks it up and tells bandmates. */
  updateProfile: (patch: { displayName?: string; gender?: GenderPreset; tint?: string }) => Promise<void>;
  swapInstrument: (role: InstrumentRole) => void;
  setSinging: (on: boolean) => void;
  setCommMode: (mode: CommMode) => void;
  setLedColor: (color: RGBA) => void;
  addWhiteboardItem: (text: string) => void;
  toggleWhiteboardItem: (id: string) => void;
  editWhiteboardItem: (id: string, text: string) => void;
  removeWhiteboardItem: (id: string) => void;
  moveWhiteboardItem: (id: string, dir: -1 | 1) => void;
  clearCompletedWhiteboard: () => void;
  dispatchShared: (action: SharedAction) => void;

  /* transport bridge — used by useJamSocket */
  applyRemote: (action: SharedAction) => void;
  subscribeOutbound: (listener: OutboundListener) => () => void;
  getSharedSnapshot: () => SharedRoomState;
}

const UserPreferencesContext = createContext<UserPreferencesValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Local preference persistence                                       */
/* ------------------------------------------------------------------ */

const THEME_KEY = 'jampod.theme';

const readTheme = (): ThemeMode => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

/** Theme lives outside any room so the login screen and picker use it too. */
export function useThemePreference(): [ThemeMode, () => void] {
  const [theme, setTheme] = useState<ThemeMode>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  return [theme, toggle];
}

/* ------------------------------------------------------------------ */
/*  Provider — mounted once per band room (keyed by band id)            */
/* ------------------------------------------------------------------ */

export interface UserPreferencesProviderProps {
  roomId: string;
  /** Everyone in the band, from the account server. */
  roster: RosterEntry[];
  /** Me, as stored on my account. */
  myProfile: RosterEntry;
  /** Persist a profile change to my account. */
  onProfileChange: (patch: { displayName?: string; gender?: GenderPreset; tint?: string }) => Promise<void>;
  children: ReactNode;
}

export function UserPreferencesProvider({ roomId, roster, myProfile, onProfileChange, children }: UserPreferencesProviderProps) {
  const [theme, toggleTheme] = useThemePreference();
  const roomChannelId = roomId;
  const localMemberId = myProfile.seat;
  const [shared, dispatch] = useReducer(sharedReducer, undefined, () => createInitialSharedState(roster, myProfile.seat));

  const sharedRef = useRef(shared);
  sharedRef.current = shared;

  const outbound = useRef(new Set<OutboundListener>());

  /** Apply locally AND notify the transport so bandmates receive it. */
  const dispatchShared = useCallback((action: SharedAction) => {
    dispatch(action);
    outbound.current.forEach((fn) => fn(action));
  }, []);

  /** Apply an action that arrived from the network (never re-broadcast). */
  const applyRemote = useCallback((action: SharedAction) => dispatch(action), []);

  const subscribeOutbound = useCallback((listener: OutboundListener) => {
    outbound.current.add(listener);
    return () => {
      outbound.current.delete(listener);
    };
  }, []);

  const getSharedSnapshot = useCallback(() => sharedRef.current, []);

  /*
   * Keep the room's copy of "me" in line with my account. This also re-adds
   * me if a bandmate's snapshot predates my joining the band, and pushes
   * name/look changes (saved to the account first) out to everyone.
   */
  useEffect(() => {
    const mine = shared.members.find((m) => m.id === myProfile.seat);
    if (!mine || mine.displayName !== myProfile.displayName || mine.gender !== myProfile.gender || mine.tint !== myProfile.tint) {
      dispatchShared({ type: 'member/join', member: myProfile });
    }
  }, [shared.members, myProfile, dispatchShared]);

  const value = useMemo<UserPreferencesValue>(() => {
    const me = shared.members.find((m) => m.id === localMemberId) ?? toMember(myProfile);
    const stamp = () => ({ by: me.id, at: Date.now() });

    return {
      theme,
      toggleTheme,
      roomChannelId,
      localMemberId,

      shared,
      me,
      activeRole: me.role,
      members: shared.members,
      whiteboard: shared.whiteboard,
      ledColor: shared.ledColor,
      commMode: shared.commMode,
      isSinging: me.isSinging,

      updateProfile: onProfileChange,
      swapInstrument: (role) => dispatchShared({ type: 'role/swap', id: me.id, role }),
      setSinging: (on) => dispatchShared({ type: 'singing/set', id: me.id, on }),
      setCommMode: (mode) => dispatchShared({ type: 'comm/set', mode }),
      setLedColor: (color) => dispatchShared({ type: 'led/set', color }),
      addWhiteboardItem: (text) => {
        const clean = text.trim();
        if (!clean) return;
        dispatchShared({
          type: 'wb/add',
          item: { id: uid('wb'), text: clean, done: false, updatedBy: me.id, updatedAt: Date.now() },
        });
      },
      toggleWhiteboardItem: (id) => dispatchShared({ type: 'wb/toggle', id, ...stamp() }),
      editWhiteboardItem: (id, text) => dispatchShared({ type: 'wb/edit', id, text, ...stamp() }),
      removeWhiteboardItem: (id) => dispatchShared({ type: 'wb/remove', id }),
      moveWhiteboardItem: (id, dir) => dispatchShared({ type: 'wb/move', id, dir }),
      clearCompletedWhiteboard: () => dispatchShared({ type: 'wb/clearDone' }),
      dispatchShared,

      applyRemote,
      subscribeOutbound,
      getSharedSnapshot,
    };
  }, [
    theme,
    toggleTheme,
    roomChannelId,
    localMemberId,
    myProfile,
    onProfileChange,
    shared,
    dispatchShared,
    applyRemote,
    subscribeOutbound,
    getSharedSnapshot,
  ]);

  return <UserPreferencesContext value={value}>{children}</UserPreferencesContext>;
}

export function useUserPreferences(): UserPreferencesValue {
  const ctx = use(UserPreferencesContext);
  if (!ctx) throw new Error('useUserPreferences must be used inside <UserPreferencesProvider>');
  return ctx;
}
