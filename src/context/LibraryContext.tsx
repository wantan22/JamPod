import { createContext, use, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
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

export type StemSource = { type: 'demo'; kind: DemoKind } | { type: 'recording'; blobUrl: string; mime: string };

export interface PublishedInfo {
  rawBytes: number;
  payloadBytes: number;
  encoding: 'gzip' | 'identity';
  path: string;
  at: number;
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

export function getStemBuffer(stem: Stem, song: Song): Promise<AudioBuffer> {
  const key = stem.source.type === 'demo' ? `${stem.source.kind}:${song.id}` : stem.source.blobUrl;
  let p = bufferCache.get(key);
  if (!p) {
    const source = stem.source;
    p =
      source.type === 'demo'
        ? Promise.resolve(synthDemoStem(source.kind, song.progression, song.bpm, song.bars))
        : fetch(source.blobUrl)
            .then((r) => r.arrayBuffer())
            .then((ab) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(ab));
    bufferCache.set(key, p);
  }
  return p;
}

export function useStemAudio(stem: Stem | undefined, song: Song): { buffer: AudioBuffer | null; peaks: number[] } {
  const [state, setState] = useState<{ id: string | null; buffer: AudioBuffer | null; peaks: number[] }>({
    id: null,
    buffer: null,
    peaks: [],
  });
  useEffect(() => {
    if (!stem) return;
    let alive = true;
    getStemBuffer(stem, song).then((buffer) => {
      if (!alive) return;
      const pk = `${stem.id}:${buffer.length}`;
      let peaks = peakCache.get(pk);
      if (!peaks) {
        peaks = computePeaks(buffer);
        peakCache.set(pk, peaks);
      }
      setState({ id: stem.id, buffer, peaks });
    });
    return () => {
      alive = false;
    };
  }, [stem, song]);
  return stem && state.id === stem.id ? state : { buffer: null, peaks: [] };
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                             */
/* ------------------------------------------------------------------ */

interface LibraryState {
  songs: Song[];
  setlists: Setlist[];
  activeSongId: string;
  activeVersionId: string;
  queue: { setlistId: string; index: number } | null;
}

type LibraryAction =
  | { type: 'song/select'; songId: string }
  | { type: 'version/select'; versionId: string }
  | { type: 'stem/set'; laneId: LaneId; stem: Stem | null }
  | { type: 'stem/update'; laneId: LaneId; patch: Partial<Omit<Stem, 'id' | 'laneId'>> }
  | { type: 'version/fork'; newId: string; label: string; note: string }
  | { type: 'setlist/create'; setlist: Setlist }
  | { type: 'setlist/rename'; id: string; name: string }
  | { type: 'setlist/delete'; id: string }
  | { type: 'setlist/insert'; id: string; songId: string; index: number }
  | { type: 'setlist/remove'; id: string; index: number }
  | { type: 'setlist/move'; fromId: string; fromIndex: number; toId: string; toIndex: number }
  | { type: 'queue/load'; setlistId: string }
  | { type: 'queue/step'; dir: 1 | -1 }
  | { type: 'queue/clear' };

const latestVersion = (song: Song) => song.versions[song.versions.length - 1];

const mapActiveVersion = (s: LibraryState, fn: (v: SongVersion) => SongVersion): LibraryState => ({
  ...s,
  songs: s.songs.map((song) =>
    song.id !== s.activeSongId ? song : { ...song, versions: song.versions.map((v) => (v.id === s.activeVersionId ? fn(v) : v)) },
  ),
});

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
      return mapActiveVersion(s, (v) => {
        const stems = { ...v.stems };
        if (a.stem) stems[a.laneId] = a.stem;
        else delete stems[a.laneId];
        return { ...v, stems };
      });
    case 'stem/update':
      return mapActiveVersion(s, (v) => {
        const cur = v.stems[a.laneId];
        if (!cur) return v;
        // Any edit invalidates a previous publish.
        const published = 'published' in a.patch ? a.patch.published : undefined;
        return { ...v, stems: { ...v.stems, [a.laneId]: { ...cur, ...a.patch, published } } };
      });
    case 'version/fork': {
      return {
        ...s,
        activeVersionId: a.newId,
        songs: s.songs.map((song) => {
          if (song.id !== s.activeSongId) return song;
          const base = song.versions.find((v) => v.id === s.activeVersionId) ?? latestVersion(song);
          const fork: SongVersion = {
            id: a.newId,
            parentId: base.id,
            label: a.label,
            note: a.note,
            createdAt: Date.now(),
            stems: { ...base.stems },
          };
          return { ...song, versions: [...song.versions, fork] };
        }),
      };
    }
    case 'setlist/create':
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

/* ------------------------------------------------------------------ */
/*  Provider                                                            */
/* ------------------------------------------------------------------ */

export interface LibraryValue extends LibraryState {
  activeSong: Song;
  activeVersion: SongVersion;
  queueList: Setlist | null;
  dispatch: (a: LibraryAction) => void;
  forkVersion: (label: string, note?: string) => void;
  createSetlist: (name: string) => void;
  /** Warm the audio cache for every stem in a setlist (gapless loading). */
  preloadSetlist: (setlistId: string) => Promise<number>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    songs: SEED_SONGS,
    setlists: SEED_SETLISTS,
    activeSongId: SEED_SONGS[0].id,
    activeVersionId: latestVersion(SEED_SONGS[0]).id,
    queue: null,
  }));

  const value = useMemo<LibraryValue>(() => {
    const activeSong = state.songs.find((s) => s.id === state.activeSongId) ?? state.songs[0];
    const activeVersion = activeSong.versions.find((v) => v.id === state.activeVersionId) ?? latestVersion(activeSong);
    return {
      ...state,
      activeSong,
      activeVersion,
      queueList: state.queue ? (state.setlists.find((l) => l.id === state.queue!.setlistId) ?? null) : null,
      dispatch,
      forkVersion: (label, note = '') => dispatch({ type: 'version/fork', newId: uid('v'), label, note }),
      createSetlist: (name) => dispatch({ type: 'setlist/create', setlist: { id: uid('set'), name, songIds: [] } }),
      preloadSetlist: async (setlistId) => {
        const list = state.setlists.find((l) => l.id === setlistId);
        if (!list) return 0;
        const jobs: Promise<AudioBuffer>[] = [];
        for (const songId of list.songIds) {
          const song = state.songs.find((s) => s.id === songId);
          if (!song) continue;
          Object.values(latestVersion(song).stems).forEach((stem) => stem && jobs.push(getStemBuffer(stem, song)));
        }
        await Promise.all(jobs);
        return jobs.length;
      },
    };
  }, [state]);

  return <LibraryContext value={value}>{children}</LibraryContext>;
}

export function useLibrary(): LibraryValue {
  const ctx = use(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return ctx;
}
