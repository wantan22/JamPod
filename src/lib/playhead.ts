/**
 * Tiny external store for the backing-track playhead. Updated at animation
 * frame rate by the media player and read via useSyncExternalStore, so the
 * 60fps chord highway never forces the whole dashboard to re-render.
 */
export interface PlayheadState {
  t: number;
  playing: boolean;
}

let state: PlayheadState = { t: 0, playing: false };
const listeners = new Set<() => void>();

export const playhead = {
  get: (): PlayheadState => state,
  set: (next: Partial<PlayheadState>) => {
    if ((next.t === undefined || next.t === state.t) && (next.playing === undefined || next.playing === state.playing)) return;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
