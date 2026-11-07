/* ------------------------------------------------------------------ */
/*  JamPod shared domain types                                         */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'dark' | 'light';

/** Global communication mode: instruments dominant vs. voice dominant. */
export type CommMode = 'jam' | 'talk';

export type InstrumentRole = 'drums' | 'keys' | 'bass' | 'guitar';

export type GenderPreset = 'masculine' | 'feminine' | 'nonbinary';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface MemberProfile {
  id: string;
  displayName: string;
  gender: GenderPreset;
  role: InstrumentRole;
  /** Hex color used for name tags, waveforms, and video tiles. */
  tint: string;
  isSinging: boolean;
  online: boolean;
}

export interface WhiteboardItem {
  id: string;
  text: string;
  done: boolean;
  /** Member id of whoever last touched the item. */
  updatedBy: string;
  updatedAt: number;
}

export type SectionKind = 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'solo' | 'outro';

export interface ArrangementBlock {
  id: string;
  kind: SectionKind;
  label: string;
  bars: number;
  votes: string[]; // member ids that up-voted
  pinned: boolean;
}

export interface CompanionLink {
  memberId: string;
  token: string;
  status: 'idle' | 'pairing' | 'paired';
  /** Is the companion phone mic currently live? (Derived from comm mode.) */
  micLive: boolean;
}

/** Everything in this object is replicated to every connected bandmate. */
export interface SharedRoomState {
  members: MemberProfile[];
  whiteboard: WhiteboardItem[];
  ledColor: RGBA;
  commMode: CommMode;
  arrangement: ArrangementBlock[];
  companion: CompanionLink | null;
}

export interface ChordEvent {
  /** Start time in seconds. */
  t: number;
  /** Duration in seconds. */
  d: number;
  chord: string;
}

export type MediaSourceKind = 'mp3' | 'youtube';

export interface ImportedMedia {
  kind: MediaSourceKind;
  title: string;
  /** Object URL (mp3) or YouTube video id. */
  src: string;
  bpm: number;
  chords: ChordEvent[];
  duration: number;
  /**
   * Set on receivers when a bandmate loaded a local MP3. Its blob URL only
   * exists on their device, so we follow their transport clock instead.
   */
  remote?: boolean;
}

export interface ActivityEntry {
  id: string;
  at: number;
  who: string;
  text: string;
  kind: 'socket' | 'audio' | 'studio' | 'room' | 'device';
}

export const ROLE_META: Record<InstrumentRole, { label: string; emoji: string; player: string }> = {
  drums: { label: 'Drums', emoji: '🥁', player: 'Drummer' },
  keys: { label: 'Keys', emoji: '🎹', player: 'Pianist' },
  bass: { label: 'Bass', emoji: '🎸', player: 'Bassist' },
  guitar: { label: 'Guitar', emoji: '🎸', player: 'Guitarist' },
};

export const ROLES: InstrumentRole[] = ['drums', 'keys', 'bass', 'guitar'];
