import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, call } from '../auth/api';
import { useJamBus } from './JamBusContext';
import { DEFAULT_MIX, computePeaks, synthDemoStem, type DemoKind, type MixSettings } from '../lib/audioEngine';
import { uid } from '../lib/utils';
import type { SectionKind } from '../types';

/* ------------------------------------------------------------------ */
/*  Library model: songs → version tree → per-lane stems                */
/* ------------------------------------------------------------------ */

export type LaneId = 'drums' | 'keys' | 'bass' | 'guitar' | 'vocals';

export const LANES: Array<{ id: LaneId; name: string; color: string; emoji: string }> = [
  { id: 'drums', name: 'Drums', color: '#E8B464', emoji: '🥁' },
  { id: 'keys', name: 'Keys', color: '#C79BD8', emoji: '🎹' },
  { id: 'bass', name: 'Bass', color: '#7FB7BE', emoji: '🎸' },
  { id: 'guitar', name: 'Guitar', color: '#E07A5F', emoji: '🎸' },
  { id: 'vocals', name: 'Vocals', color: '#8FB996', emoji: '🎤' },
];

/**
 * Where a stem's audio comes from:
 *  - demo:      synthesized locally (identical on every device)
 *  - recording: a fresh take that exists only on the recording device (a draft)
 *  - shared:    a published take stored on the server for the whole band
 */
export type StemSource =
  | { type: 'demo'; kind: DemoKind }
  | { type: 'recording'; blobUrl: string; mime: string }
  | { type: 'shared'; url: string; mime: string };

export interface PublishedInfo {
  bytes: number;
  at: number;
  by: string;
}

export interface Stem {
  id: string;
  laneId: LaneId;
  source: StemSource;
  /** 0..1 fractions of the stem's own duration. */
  trimStart: number;
  trimEnd: number;
  mix: MixSettings;
  author: string;
  createdAt: number;
  published?: PublishedInfo;
}

export interface SongSection {
  id: string;
  kind: SectionKind;
  label: string;
  startBar: number;
  bars: number;
}

export interface SongVersion {
  id: string;
  parentId: string | null;
  label: string;
  note: string;
  createdAt: number;
  stems: Partial<Record<LaneId, Stem>>;
}

export interface SheetNote {
  pitch: string; // e.g. "E4"
  beats: number; // 1 = quarter
}

export interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
  bars: number;
  progression: string[];
  sections: SongSection[];
  versions: SongVersion[];
  lyrics: string;
  sheet: SheetNote[];
}

export interface Setlist {
  id: string;
  name: string;
  songIds: string[];
}

/* ------------------------------------------------------------------ */
/*  Seed catalog                                                        */
/* ------------------------------------------------------------------ */

const demoStem = (laneId: LaneId, kind: DemoKind, author: string, mix: Partial<MixSettings> = {}): Stem => ({
  id: `stem_${laneId}_${kind}_${author}_${Object.values(mix).join('')}`,
  laneId,
  source: { type: 'demo', kind },
  trimStart: 0,
  trimEnd: 1,
  mix: { ...DEFAULT_MIX, ...mix },
  author,
  createdAt: Date.now() - 86_400_000 * 3,
});

const standardSections = (): SongSection[] => [
  { id: 'sec_intro', kind: 'intro', label: 'Intro', startBar: 0, bars: 2 },
  { id: 'sec_verse', kind: 'verse', label: 'Verse 1', startBar: 2, bars: 4 },
  { id: 'sec_chorus', kind: 'chorus', label: 'Chorus', startBar: 6, bars: 4 },
  { id: 'sec_outro', kind: 'outro', label: 'Outro', startBar: 10, bars: 2 },
];

const SEED_SONGS: Song[] = [
  {
    id: 'song_lanterns',
    title: 'Paper Lanterns',
    key: 'C major',
    bpm: 96,
    bars: 12,
    progression: ['C', 'G', 'Am', 'F'],
    sections: standardSections(),
    versions: [
      {
        id: 'v_lan_1',
        parentId: null,
        label: 'Acoustic Demo v1',
        note: 'Phone-in-the-garage sketch',
        createdAt: Date.now() - 86_400_000 * 9,
        stems: { keys: demoStem('keys', 'keys', 'Mei'), guitar: demoStem('guitar', 'guitar', 'Ava') },
      },
      {
        id: 'v_lan_2',
        parentId: 'v_lan_1',
        label: 'Full Track Demo v2',
        note: 'Rhythm section joined',
        createdAt: Date.now() - 86_400_000 * 4,
        stems: {
          drums: demoStem('drums', 'drums', 'Kai'),
          keys: demoStem('keys', 'keys', 'Mei'),
          bass: demoStem('bass', 'bass', 'Rowan'),
          guitar: demoStem('guitar', 'guitar', 'Ava'),
        },
      },
      {
        id: 'v_lan_3',
        parentId: 'v_lan_2',
        label: 'Studio Mix Master',
        note: 'Warmer lows, verb on keys',
        createdAt: Date.now() - 86_400_000,
        stems: {
          drums: demoStem('drums', 'drums', 'Kai', { gain: 0.85, high: 3 }),
          keys: demoStem('keys', 'keys', 'Mei', { reverb: true, mid: -2 }),
          bass: demoStem('bass', 'bass', 'Rowan', { low: 4, gain: 1 }),
          guitar: demoStem('guitar', 'guitar', 'Ava', { high: 2, gain: 0.8 }),
        },
      },
    ],
    lyrics:
      '[Verse 1]\nWe hung our hopes on paper strings\nAbove the garage door\nThe amp still hums the way it did\nWhen we were seventeen and sure\n\n[Chorus]\nLight it up, let it drift\nEvery note a little gift\nPaper lanterns, burning slow\nWe were never meant to know\n\n[Outro]\nLet it drift… let it drift…',
    sheet: [
      { pitch: 'E4', beats: 1 }, { pitch: 'G4', beats: 1 }, { pitch: 'G4', beats: 1 }, { pitch: 'A4', beats: 1 },
      { pitch: 'G4', beats: 2 }, { pitch: 'E4', beats: 2 },
      { pitch: 'C5', beats: 1 }, { pitch: 'B4', beats: 1 }, { pitch: 'A4', beats: 1 }, { pitch: 'G4', beats: 1 },
      { pitch: 'A4', beats: 2 }, { pitch: 'F4', beats: 2 },
    ],
  },
  {
    id: 'song_neon',
    title: 'Neon Bus Stop',
    key: 'A minor',
    bpm: 104,
    bars: 12,
    progression: ['Am', 'F', 'C', 'G'],
    sections: standardSections(),
    versions: [
      {
        id: 'v_neon_1',
        parentId: null,
        label: 'Groove Sketch',
        note: 'Bass + drums lock-in',
        createdAt: Date.now() - 86_400_000 * 2,
        stems: { drums: demoStem('drums', 'drums', 'Kai'), bass: demoStem('bass', 'bass', 'Rowan') },
      },
    ],
    lyrics: '[Verse]\nTwelve-oh-five, the sign is flickering\nYou hum along to the engine’s bickering\n\n[Chorus]\nNeon bus stop, glow for me\nOne more ride to anywhere free',
    sheet: [
      { pitch: 'A4', beats: 1 }, { pitch: 'C5', beats: 1 }, { pitch: 'B4', beats: 2 },
      { pitch: 'A4', beats: 1 }, { pitch: 'G4', beats: 1 }, { pitch: 'E4', beats: 2 },
    ],
  },
  {
    id: 'song_kitchen',
    title: 'Kitchen Floor Blues',
    key: 'A major',
    bpm: 82,
    bars: 12,
    progression: ['A', 'A', 'D', 'A', 'E', 'D', 'A', 'E'],
    sections: standardSections(),
    versions: [
      {
        id: 'v_kit_1',
        parentId: null,
        label: 'Rough idea',
        note: '12-bar warm-up',
        createdAt: Date.now() - 86_400_000 * 14,
        stems: { guitar: demoStem('guitar', 'guitar', 'Ava') },
      },
    ],
    lyrics: '[Verse]\nWoke up on the kitchen floor\nGuitar still tuned in E\nDidn’t need no audience\nJust the band and me',
    sheet: [
      { pitch: 'A4', beats: 1 }, { pitch: 'C5', beats: 1 }, { pitch: 'A4', beats: 1 }, { pitch: 'E4', beats: 1 },
      { pitch: 'G4', beats: 2 }, { pitch: 'A4', beats: 2 },
    ],
  },
];

const SEED_SETLISTS: Setlist[] = [
  { id: 'set_gig', name: 'Setlist for Live Gig', songIds: ['song_neon', 'song_lanterns'] },
  { id: 'set_album', name: 'Album Scratchpads', songIds: ['song_kitchen'] },
];

/* ------------------------------------------------------------------ */
/*  Audio buffer + peak cache (outside React state: not serializable)   */
/* ------------------------------------------------------------------ */

const bufferCache = new Map<string, Promise<AudioBuffer>>();
const peakCache = new Map<string, number[]>();

const decode = (ab: ArrayBuffer) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab);

const sourceKey = (stem: Stem, song: Song) =>
  stem.source.type === 'demo' ? `${stem.source.kind}:${song.id}:${song.bpm}:${song.bars}` : stem.source.type === 'shared' ? stem.source.url : stem.source.blobUrl;

export function getStemBuffer(stem: Stem, song: Song): Promise<AudioBuffer> {
  const key = sourceKey(stem, song);
  let p = bufferCache.get(key);
  if (!p) {
    const source = stem.source;
    if (source.type === 'demo') {
      p = Promise.resolve(synthDemoStem(source.kind, song.progression, song.bpm, song.bars));
    } else {
      const url = source.type === 'shared' ? source.url : source.blobUrl;
      p = fetch(url, { credentials: 'same-origin' })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then(decode);
    }
    // Don't cache failures (e.g. a draft that's not on this device yet, or a network blip).
    p.catch(() => bufferCache.delete(key));
    bufferCache.set(key, p);
  }
  return p;
}

export interface StemAudio {
  buffer: AudioBuffer | null;
  peaks: number[];
  /** Set when the audio can't be loaded here (e.g. someone else's unpublished draft). */
  error: string | null;
}

export function useStemAudio(stem: Stem | undefined, song: Song): StemAudio {
  const [state, setState] = useState<{ key: string | null } & StemAudio>({ key: null, buffer: null, peaks: [], error: null });
  const key = stem ? sourceKey(stem, song) : null;
  useEffect(() => {
    if (!stem || !key) return;
    let alive = true;
    getStemBuffer(stem, song).then(
      (buffer) => {
        if (!alive) return;
        let peaks = peakCache.get(key);
        if (!peaks) {
          peaks = computePeaks(buffer);
          peakCache.set(key, peaks);
        }
        setState({ key, buffer, peaks, error: null });
      },
      (e: Error) => {
        if (!alive) return;
        setState({
          key,
          buffer: null,
          peaks: [],
          error:
            stem.source.type === 'recording'
              ? `${stem.author}’s draft. It plays once they publish it.`
              : `Couldn’t load this recording (${e.message}).`,
        });
      },
    );
    return () => {
      alive = false;
    };
    // Re-load only when the audio source changes, not on every mixer tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { buffer: null, peaks: [], error: null };
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                             */
/* ------------------------------------------------------------------ */

/** The part of the library shared with the whole band (saved on the server). */
export interface LibraryDoc {
  songs: Song[];
  setlists: Setlist[];
}

/** Per-person view state (never shared). */
interface LocalView {
  activeSongId: string;
  activeVersionId: string;
  queue: { setlistId: string; index: number } | null;
}

type LibraryState = LibraryDoc & LocalView;

/** Where a stem/version edit applies. Captured at dispatch time so a later re-apply hits the same version. */
interface Target {
  songId: string;
  versionId: string;
}

export type LibraryAction =
  | { type: 'song/select'; songId: string }
  | { type: 'version/select'; versionId: string }
  | { type: 'stem/set'; laneId: LaneId; stem: Stem | null; at?: Target }
  | { type: 'stem/update'; laneId: LaneId; patch: Partial<Omit<Stem, 'id' | 'laneId'>>; at?: Target }
  | { type: 'version/fork'; newId: string; label: string; note: string; createdAt?: number; at?: Target }
  | { type: 'setlist/create'; setlist: Setlist }
  | { type: 'setlist/rename'; id: string; name: string }
  | { type: 'setlist/delete'; id: string }
  | { type: 'setlist/insert'; id: string; songId: string; index: number }
  | { type: 'setlist/remove'; id: string; index: number }
  | { type: 'setlist/move'; fromId: string; fromIndex: number; toId: string; toIndex: number }
  | { type: 'queue/load'; setlistId: string }
  | { type: 'queue/step'; dir: 1 | -1 }
  | { type: 'queue/clear' };

/** Actions that only change what *I'm* looking at; everything else is saved for the band. */
const LOCAL_ONLY = new Set<LibraryAction['type']>(['song/select', 'version/select', 'queue/load', 'queue/step', 'queue/clear']);

const latestVersion = (song: Song) => song.versions[song.versions.length - 1];

const mapVersion = (s: LibraryState, at: Target, fn: (v: SongVersion) => SongVersion): LibraryState => ({
  ...s,
  songs: s.songs.map((song) =>
    song.id !== at.songId ? song : { ...song, versions: song.versions.map((v) => (v.id === at.versionId ? fn(v) : v)) },
  ),
});

const activeTarget = (s: LibraryState): Target => ({ songId: s.activeSongId, versionId: s.activeVersionId });

function selectSong(s: LibraryState, songId: string): LibraryState {
  const song = s.songs.find((x) => x.id === songId);
  if (!song) return s;
  return { ...s, activeSongId: song.id, activeVersionId: latestVersion(song).id };
}

function reducer(s: LibraryState, a: LibraryAction): LibraryState {
  switch (a.type) {
    case 'song/select':
      return selectSong(s, a.songId);
    case 'version/select':
      return { ...s, activeVersionId: a.versionId };
    case 'stem/set':
      return mapVersion(s, a.at ?? activeTarget(s), (v) => {
        const stems = { ...v.stems };
        if (a.stem) stems[a.laneId] = a.stem;
        else delete stems[a.laneId];
        return { ...v, stems };
      });
    case 'stem/update':
      return mapVersion(s, a.at ?? activeTarget(s), (v) => {
        const cur = v.stems[a.laneId];
        if (!cur) return v;
        // Mixer/trim edits are non-destructive; only replacing the audio resets "published".
        const published = a.patch.source ? a.patch.published : 'published' in a.patch ? a.patch.published : cur.published;
        return { ...v, stems: { ...v.stems, [a.laneId]: { ...cur, ...a.patch, published } } };
      });
    case 'version/fork': {
      const at = a.at ?? activeTarget(s);
      const songs = s.songs.map((song) => {
        if (song.id !== at.songId || song.versions.some((v) => v.id === a.newId)) return song;
        const base = song.versions.find((v) => v.id === at.versionId) ?? latestVersion(song);
        const fork: SongVersion = {
          id: a.newId,
          parentId: base.id,
          label: a.label,
          note: a.note,
          createdAt: a.createdAt ?? Date.now(),
          stems: { ...base.stems },
        };
        return { ...song, versions: [...song.versions, fork] };
      });
      return { ...s, songs, activeVersionId: s.activeSongId === at.songId ? a.newId : s.activeVersionId };
    }
    case 'setlist/create':
      if (s.setlists.some((l) => l.id === a.setlist.id)) return s;
      return { ...s, setlists: [...s.setlists, a.setlist] };
    case 'setlist/rename':
      return { ...s, setlists: s.setlists.map((l) => (l.id === a.id ? { ...l, name: a.name } : l)) };
    case 'setlist/delete':
      return { ...s, setlists: s.setlists.filter((l) => l.id !== a.id), queue: s.queue?.setlistId === a.id ? null : s.queue };
    case 'setlist/insert':
      return {
        ...s,
        setlists: s.setlists.map((l) => {
          if (l.id !== a.id) return l;
          const ids = l.songIds.slice();
          ids.splice(Math.min(a.index, ids.length), 0, a.songId);
          return { ...l, songIds: ids };
        }),
      };
    case 'setlist/remove':
      return {
        ...s,
        setlists: s.setlists.map((l) => (l.id === a.id ? { ...l, songIds: l.songIds.filter((_, i) => i !== a.index) } : l)),
      };
    case 'setlist/move': {
      const from = s.setlists.find((l) => l.id === a.fromId);
      const songId = from?.songIds[a.fromIndex];
      if (!songId) return s;
      const removed = reducer(s, { type: 'setlist/remove', id: a.fromId, index: a.fromIndex });
      const adj = a.fromId === a.toId && a.toIndex > a.fromIndex ? a.toIndex - 1 : a.toIndex;
      return reducer(removed, { type: 'setlist/insert', id: a.toId, songId, index: adj });
    }
    case 'queue/load': {
      const list = s.setlists.find((l) => l.id === a.setlistId);
      if (!list?.songIds.length) return s;
      return { ...selectSong(s, list.songIds[0]), queue: { setlistId: list.id, index: 0 } };
    }
    case 'queue/step': {
      if (!s.queue) return s;
      const list = s.setlists.find((l) => l.id === s.queue!.setlistId);
      if (!list) return { ...s, queue: null };
      const index = s.queue.index + a.dir;
      if (index < 0 || index >= list.songIds.length) return s;
      return { ...selectSong(s, list.songIds[index]), queue: { ...s.queue, index } };
    }
    case 'queue/clear':
      return { ...s, queue: null };
    default: {
      const never: never = a;
      return never;
    }
  }
}

const pickDoc = (s: LibraryState): LibraryDoc => ({ songs: s.songs, setlists: s.setlists });
const pickLocal = (s: LibraryState): LocalView => ({ activeSongId: s.activeSongId, activeVersionId: s.activeVersionId, queue: s.queue });

/** Keep my selection valid when the band's library changes under me. */
function normalize(s: LibraryState): LibraryState {
  if (!s.songs.length) return s;
  const song = s.songs.find((x) => x.id === s.activeSongId) ?? s.songs[0];
  const version = song.versions.find((v) => v.id === s.activeVersionId) ?? latestVersion(song);
  return { ...s, activeSongId: song.id, activeVersionId: version.id };
}

/* ------------------------------------------------------------------ */
/*  Provider — loads the band's shared library and keeps it in sync     */
/* ------------------------------------------------------------------ */

export type SyncStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'error';

export interface LibraryValue extends LibraryState {
  activeSong: Song;
  activeVersion: SongVersion;
  queueList: Setlist | null;
  sync: SyncStatus;
  syncError: string | null;
  bandId: string;
  dispatch: (a: LibraryAction) => void;
  forkVersion: (label: string, note?: string) => void;
  createSetlist: (name: string) => void;
  /** Warm the audio cache for every stem in a setlist (gapless loading). */
  preloadSetlist: (setlistId: string) => Promise<number>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

const SAVE_DEBOUNCE_MS = 500;
const seedDoc = (): LibraryDoc => ({ songs: SEED_SONGS, setlists: SEED_SETLISTS });

const libraryPath = (bandId: string) => `/api/bands/${encodeURIComponent(bandId)}/library`;

/**
 * Sync model (optimistic, conflict-safe):
 *   confirmed = last copy the server accepted (+ its rev)
 *   pending   = my edits not yet acknowledged
 *   shown     = pending replayed on top of confirmed
 * Saving sends `shown` with the confirmed rev. If a bandmate saved first the
 * server returns its copy (409): it becomes `confirmed`, my pending edits are
 * replayed on top, and we save again. Bandmates are pinged over the jam
 * socket after each save and refetch.
 */
export function LibraryProvider({ bandId, children }: { bandId: string; children: ReactNode }) {
  const { socket } = useJamBus();

  const [confirmed, setConfirmed] = useState<{ rev: number; doc: LibraryDoc } | null>(null);
  const [pending, setPending] = useState<LibraryAction[]>([]);
  const [local, setLocal] = useState<LocalView>(() => ({
    activeSongId: SEED_SONGS[0].id,
    activeVersionId: latestVersion(SEED_SONGS[0]).id,
    queue: null,
  }));
  const [sync, setSync] = useState<SyncStatus>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);

  const state = useMemo<LibraryState>(() => {
    const base: LibraryState = { ...(confirmed?.doc ?? seedDoc()), ...local };
    return normalize(pending.reduce(reducer, base));
  }, [confirmed, pending, local]);

  // Refs so async save/refetch code always sees the latest values.
  const stateRef = useRef(state);
  stateRef.current = state;
  const confirmedRef = useRef(confirmed);
  confirmedRef.current = confirmed;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inFlight = useRef(false);
  /** Update the ref immediately so a retry scheduled right away sees the new base. */
  const adoptConfirmed = (next: { rev: number; doc: LibraryDoc }) => {
    confirmedRef.current = next;
    setConfirmed(next);
  };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelay = useRef(1000);

  /* ---------- load / refetch ---------- */
  const refetch = useCallback(async () => {
    try {
      const r = await call<{ rev: number; doc: LibraryDoc | null }>('GET', libraryPath(bandId));
      const cur = confirmedRef.current;
      if (!cur || r.rev > cur.rev || (r.rev === 0 && cur.rev === 0)) {
        adoptConfirmed({ rev: r.rev, doc: r.doc ?? seedDoc() });
      }
      setSync(pendingRef.current.length ? 'saving' : 'saved');
      setSyncError(null);
      // A brand-new band: store the starter songs so everyone shares them.
      if (r.rev === 0 && !r.doc && !pendingRef.current.length) scheduleSave(0);
    } catch (e) {
      const err = e as ApiError;
      setSync(err.status === 0 ? 'offline' : 'error');
      setSyncError(err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /* ---------- save ---------- */
  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const base = confirmedRef.current;
    if (!base) return;
    const sentActions = pendingRef.current;
    const isSeed = base.rev === 0;
    if (!sentActions.length && !isSeed) {
      setSync('saved');
      return;
    }
    inFlight.current = true;
    setSync('saving');
    const doc = pickDoc(normalize(sentActions.reduce(reducer, { ...base.doc, ...pickLocal(stateRef.current) })));
    try {
      const r = await call<{ rev: number }>('PUT', libraryPath(bandId), { baseRev: base.rev, doc });
      adoptConfirmed({ rev: r.rev, doc });
      pendingRef.current = pendingRef.current.slice(sentActions.length);
      setPending((p) => p.slice(sentActions.length));
      retryDelay.current = 1000;
      setSyncError(null);
      socket.sendEphemeral({ kind: 'library', rev: r.rev });
      inFlight.current = false;
      if (pendingRef.current.length > sentActions.length) scheduleSave();
      else setSync('saved');
    } catch (e) {
      inFlight.current = false;
      const err = e as ApiError;
      if (err.status === 409) {
        // Someone saved first: adopt their copy, replay mine on top, try again.
        const latest = err.body as { rev: number; doc: LibraryDoc | null } | undefined;
        if (latest?.doc) adoptConfirmed({ rev: latest.rev, doc: latest.doc });
        else await refetch();
        scheduleSave(0);
      } else {
        setSync(err.status === 0 ? 'offline' : 'error');
        setSyncError(err.message);
        if (err.status === 0 || err.status >= 500) {
          scheduleSave(retryDelay.current);
          retryDelay.current = Math.min(30_000, retryDelay.current * 2);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandId, socket]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), delay);
  }

  /* ---------- bandmates' saves ---------- */
  useEffect(
    () =>
      socket.onEphemeral((msg) => {
        if (msg.kind === 'library' && msg.rev > (confirmedRef.current?.rev ?? 0)) void refetch();
      }),
    [socket, refetch],
  );
  // Catch up after a reconnect or when coming back to the tab.
  useEffect(() => {
    if (socket.status === 'open') void refetch();
  }, [socket.status, refetch]);
  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && void refetch();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refetch]);
  // Try to save anything outstanding before the page goes away.
  useEffect(() => () => clearTimeout(timer.current), []);

  /* ---------- dispatch ---------- */
  const dispatch = useCallback((a: LibraryAction) => {
    const cur = stateRef.current;
    // Pin version-scoped edits to the version on screen right now.
    const action =
      (a.type === 'stem/set' || a.type === 'stem/update' || a.type === 'version/fork') && !a.at
        ? { ...a, at: activeTarget(cur), ...(a.type === 'version/fork' ? { createdAt: Date.now() } : {}) }
        : a;
    setLocal(pickLocal(normalize(reducer(cur, action))));
    if (!LOCAL_ONLY.has(action.type)) {
      setPending((p) => [...p, action]);
      setSync('saving');
      scheduleSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LibraryValue>(() => {
    const activeSong = state.songs.find((s) => s.id === state.activeSongId) ?? state.songs[0];
    const activeVersion = activeSong.versions.find((v) => v.id === state.activeVersionId) ?? latestVersion(activeSong);
    return {
      ...state,
      activeSong,
      activeVersion,
      queueList: state.queue ? (state.setlists.find((l) => l.id === state.queue!.setlistId) ?? null) : null,
      sync,
      syncError,
      bandId,
      dispatch,
      forkVersion: (label, note = '') => dispatch({ type: 'version/fork', newId: uid('v'), label, note }),
      createSetlist: (name) => dispatch({ type: 'setlist/create', setlist: { id: uid('set'), name, songIds: [] } }),
      preloadSetlist: async (setlistId) => {
        const list = state.setlists.find((l) => l.id === setlistId);
        if (!list) return 0;
        const jobs: Promise<AudioBuffer | null>[] = [];
        for (const songId of list.songIds) {
          const song = state.songs.find((s) => s.id === songId);
          if (!song) continue;
          Object.values(latestVersion(song).stems).forEach(
            (stem) => stem && jobs.push(getStemBuffer(stem, song).catch(() => null)),
          );
        }
        const loaded = await Promise.all(jobs);
        return loaded.filter(Boolean).length;
      },
    };
  }, [state, sync, syncError, bandId, dispatch]);

  return <LibraryContext value={value}>{children}</LibraryContext>;
}

export function useLibrary(): LibraryValue {
  const ctx = use(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return ctx;
}
