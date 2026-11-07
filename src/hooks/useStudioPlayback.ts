import { useCallback, useEffect, useRef, useState } from 'react';
import { applyMix, buildChannelStrip, makeImpulse, type ChannelStrip } from '../lib/audioEngine';
import { getStemBuffer, type LaneId, type Song, type SongVersion } from '../context/LibraryContext';

export interface StudioPlayback {
  playing: boolean;
  position: number;
  songDuration: number;
  play: (from?: number, opts?: { exclude?: LaneId }) => Promise<void>;
  stop: () => void;
  seek: (sec: number) => void;
}

/**
 * Multi-track transport for the Song Studio. Each stem gets its own channel
 * strip (3-band EQ, gain, reverb send) so mixer moves are heard instantly.
 * Trimmed regions stay aligned to their original timeline position.
 */
export function useStudioPlayback(song: Song, version: SongVersion, muted: Partial<Record<LaneId, boolean>>, duck = 1): StudioPlayback {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const irRef = useRef<AudioBuffer | null>(null);
  const strips = useRef(new Map<LaneId, ChannelStrip>());
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const clock = useRef({ ctxStart: 0, from: 0 });
  const raf = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  const songDuration = song.bars * 4 * (60 / song.bpm);
  const versionRef = useRef(version);
  versionRef.current = version;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const ensureCtx = () => {
    if (!ctxRef.current) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const master = new GainNode(ctx, { gain: duck });
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      irRef.current = makeImpulse(ctx);
    }
    return ctxRef.current;
  };

  const halt = useCallback(() => {
    sources.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    });
    sources.current = [];
    strips.current.forEach((st) => st.input.disconnect());
    strips.current.clear();
    cancelAnimationFrame(raf.current);
  }, []);

  const stop = useCallback(() => {
    if (ctxRef.current && playing) {
      setPosition(clock.current.from + ctxRef.current.currentTime - clock.current.ctxStart);
    }
    halt();
    setPlaying(false);
  }, [halt, playing]);

  const play = useCallback(
    async (from = position, opts: { exclude?: LaneId } = {}) => {
      halt();
      const ctx = ensureCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const start = from >= songDuration - 0.05 ? 0 : from;
      const when = ctx.currentTime + 0.08;
      const v = versionRef.current;

      const entries = Object.entries(v.stems) as Array<[LaneId, NonNullable<SongVersion['stems'][LaneId]>]>;
      await Promise.all(
        entries.map(async ([laneId, stem]) => {
          if (laneId === opts.exclude) return;
          const buffer = await getStemBuffer(stem, song);
          const strip = buildChannelStrip(ctx, masterRef.current!, irRef.current!, stem.mix);
          if (mutedRef.current[laneId]) strip.gain.gain.value = 0;
          strips.current.set(laneId, strip);
          const a = stem.trimStart * buffer.duration;
          const b = stem.trimEnd * buffer.duration;
          if (start >= b) return;
          const src = new AudioBufferSourceNode(ctx, { buffer });
          src.connect(strip.input);
          if (start < a) src.start(when + (a - start), a, b - a);
          else src.start(when, start, b - start);
          sources.current.push(src);
        }),
      );

      clock.current = { ctxStart: when, from: start };
      setPlaying(true);
      let lastUi = 0;
      const tick = (now: number) => {
        raf.current = requestAnimationFrame(tick);
        if (now - lastUi < 40) return;
        lastUi = now;
        const pos = clock.current.from + Math.max(0, ctx.currentTime - clock.current.ctxStart);
        if (pos >= songDuration) {
          halt();
          setPlaying(false);
          setPosition(0);
          return;
        }
        setPosition(pos);
      };
      raf.current = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [halt, position, song, songDuration],
  );

  const seek = useCallback(
    (sec: number) => {
      const target = Math.max(0, Math.min(songDuration, sec));
      setPosition(target);
      if (playing) void play(target);
    },
    [play, playing, songDuration],
  );

  /* live mixer updates while playing */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    (Object.entries(version.stems) as Array<[LaneId, NonNullable<SongVersion['stems'][LaneId]>]>).forEach(([laneId, stem]) => {
      const strip = strips.current.get(laneId);
      if (!strip) return;
      applyMix(strip, { ...stem.mix, gain: muted[laneId] ? 0 : stem.mix.gain }, ctx);
    });
  }, [version, muted]);

  /* Jam/Talk ducking on the master bus */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx && masterRef.current) masterRef.current.gain.setTargetAtTime(duck, ctx.currentTime, 0.1);
  }, [duck]);

  /* hot-swapping version/song stops the transport */
  useEffect(() => {
    halt();
    setPlaying(false);
    setPosition(0);
  }, [song.id, version.id, halt]);

  useEffect(
    () => () => {
      halt();
      void ctxRef.current?.close();
    },
    [halt],
  );

  return { playing, position, songDuration, play, stop, seek };
}
