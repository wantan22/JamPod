import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useJamBus } from '../../context/JamBusContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { analyzeBufferChords, progressionToChart, seededProgression } from '../../lib/chords';
import { playhead } from '../../lib/playhead';
import { cx, formatTime, parseYouTubeId } from '../../lib/utils';
import { loadYouTubeApi, type YTPlayer } from '../../lib/youtube';
import type { ImportedMedia } from '../../types';

interface MediaDockProps {
  media: ImportedMedia | null;
  onMedia: (m: ImportedMedia | null) => void;
}

type Phase = { kind: 'idle' } | { kind: 'analyzing'; progress: number; name: string } | { kind: 'error'; message: string };

/**
 * Live Media Link Importer: accepts raw MP3 (real client-side chord
 * extraction via chroma analysis) or a YouTube link (embedded player +
 * editable progression, since cross-origin YouTube audio can't be decoded).
 */
export function MediaDock({ media, onMedia }: MediaDockProps) {
  const { commMode } = useUserPreferences();
  const { socket } = useJamBus();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [url, setUrl] = useState('');
  const [progression, setProgression] = useState('');
  const [bpm, setBpm] = useState(96);
  const [dragOver, setDragOver] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const ytPlayer = useRef<YTPlayer | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Follower mode: a bandmate's MP3 lives only on their device, so we run a
   * virtual clock driven by their transport messages and scroll the chords.
   */
  const follower = media?.kind === 'mp3' && !!media.remote;
  const vclock = useRef({ t0: 0, at: 0, playing: false });
  const vnow = () => {
    const c = vclock.current;
    const t = c.playing ? c.t0 + (performance.now() - c.at) / 1000 : c.t0;
    return Math.min(t, media?.duration ?? t);
  };
  const setVirtual = (t: number, isPlaying: boolean) => {
    vclock.current = { t0: t, at: performance.now(), playing: isPlaying };
    setPlaying(isPlaying);
    playhead.set({ t, playing: isPlaying });
  };

  /* ---------- unified player facade ---------- */
  const player = {
    play: () => {
      if (media?.kind === 'youtube') ytPlayer.current?.playVideo();
      else if (follower) setVirtual(vnow(), true);
      else void audioRef.current?.play();
    },
    pause: () => {
      if (media?.kind === 'youtube') ytPlayer.current?.pauseVideo();
      else if (follower) setVirtual(vnow(), false);
      else audioRef.current?.pause();
    },
    seek: (s: number) => {
      if (media?.kind === 'youtube') ytPlayer.current?.seekTo(s, true);
      else if (follower) vclock.current = { ...vclock.current, t0: s, at: performance.now() };
      else if (audioRef.current) audioRef.current.currentTime = s;
      playhead.set({ t: s });
      setTime(s);
    },
    now: () =>
      media?.kind === 'youtube' ? (ytPlayer.current?.getCurrentTime() ?? 0) : follower ? vnow() : (audioRef.current?.currentTime ?? 0),
  };
  const playerRef = useRef(player);
  playerRef.current = player;

  /* ---------- import: MP3 ---------- */
  const importFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)) {
        setPhase({ kind: 'error', message: 'That file is not audio. Try an MP3, WAV, or M4A.' });
        return;
      }
      setPhase({ kind: 'analyzing', progress: 0, name: file.name });
      try {
        const buf = await file.arrayBuffer();
        const decoder = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await decoder.decodeAudioData(buf);
        const result = await analyzeBufferChords(audioBuffer, (p) =>
          setPhase({ kind: 'analyzing', progress: p, name: file.name }),
        );
        const next: ImportedMedia = {
          kind: 'mp3',
          title: file.name.replace(/\.[^.]+$/, ''),
          src: URL.createObjectURL(file),
          bpm: result.bpm,
          chords: result.chords,
          duration: result.duration,
        };
        onMedia(next);
        socket.sendEphemeral({ kind: 'media', media: next });
        socket.log(`Extracted ${result.chords.length} chord changes from "${next.title}" (${result.bpm} BPM)`, 'audio', 'you');
        setPhase({ kind: 'idle' });
      } catch (e) {
        setPhase({ kind: 'error', message: `Couldn't decode that file: ${(e as Error).message}` });
      }
    },
    [onMedia, socket],
  );

  /* ---------- import: YouTube ---------- */
  const importYouTube = (e: FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(url);
    if (!id) {
      setPhase({ kind: 'error', message: 'That doesn’t look like a YouTube link.' });
      return;
    }
    const prog = progression.trim() ? progression.trim().split(/[\s,|]+/) : seededProgression(id);
    const duration = 240;
    const next: ImportedMedia = {
      kind: 'youtube',
      title: `YouTube · ${id}`,
      src: id,
      bpm,
      chords: progressionToChart(prog, bpm, duration),
      duration,
    };
    setProgression(prog.join(' '));
    onMedia(next);
    socket.sendEphemeral({ kind: 'media', media: next });
    socket.log(`Loaded YouTube backing track (${prog.join(' – ')} @ ${bpm} BPM)`, 'audio', 'you');
    setPhase({ kind: 'idle' });
    setUrl('');
  };

  /** Re-chart a YouTube track after editing progression/BPM. */
  const rechart = () => {
    if (!media || media.kind !== 'youtube') return;
    const prog = progression.trim().split(/[\s,|]+/).filter(Boolean);
    const next = { ...media, bpm, chords: progressionToChart(prog, bpm, media.duration) };
    onMedia(next);
    socket.sendEphemeral({ kind: 'media', media: next });
  };

  /* ---------- YouTube player lifecycle ---------- */
  useEffect(() => {
    if (media?.kind !== 'youtube' || !ytHost.current) return;
    let cancelled = false;
    const host = document.createElement('div');
    ytHost.current.replaceChildren(host);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        ytPlayer.current = new YT.Player(host, {
          videoId: media.src,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, modestbranding: 1, rel: 0 },
          events: {
            onReady: (ev) => {
              const d = ev.target.getDuration();
              if (d > 0 && Math.abs(d - media.duration) > 1) {
                const prog = [...new Set(media.chords.slice(0, 8).map((c) => c.chord))];
                onMedia({ ...media, duration: d, chords: progressionToChart(prog, media.bpm, d) });
              }
            },
            onStateChange: (ev) => {
              setPlaying(ev.data === YT.PlayerState.PLAYING);
              playhead.set({ playing: ev.data === YT.PlayerState.PLAYING });
            },
          },
        });
      })
      .catch((e: Error) => setPhase({ kind: 'error', message: e.message }));
    return () => {
      cancelled = true;
      ytPlayer.current?.destroy();
      ytPlayer.current = null;
    };
    // Only rebuild the iframe when the video itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.kind, media?.src]);

  /* ---------- playhead pump ---------- */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = playerRef.current.now();
      playhead.set({ t });
      if (now - lastUi > 250) {
        lastUi = now;
        setTime(t);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  /* ---------- JAM/TALK ducking of the backing track ---------- */
  useEffect(() => {
    const vol = commMode === 'talk' ? 0.2 : 0.9;
    if (audioRef.current) audioRef.current.volume = vol;
    ytPlayer.current?.setVolume(vol * 100);
  }, [commMode, media]);

  /* ---------- remote media + transport ---------- */
  useEffect(
    () =>
      socket.onEphemeral((msg) => {
        if (msg.kind === 'media') {
          onMedia({ ...msg.media, remote: true });
          socket.log(`Bandmate loaded "${msg.media.title}" — highway synced`, 'audio', 'remote');
        }
        if (msg.kind === 'transport') {
          const drift = msg.playing ? (Date.now() - msg.at) / 1000 : 0;
          playerRef.current.seek(msg.t + drift);
          if (msg.playing) playerRef.current.play();
          else playerRef.current.pause();
        }
      }),
    [socket, onMedia],
  );

  useEffect(() => {
    playhead.set({ t: 0, playing: false });
    vclock.current = { t0: 0, at: 0, playing: false };
    setTime(0);
    setPlaying(false);
  }, [media?.src]);

  const broadcastTransport = (isPlaying: boolean, t: number) =>
    socket.sendEphemeral({ kind: 'transport', playing: isPlaying, t, at: Date.now() });

  const togglePlay = () => {
    const t = player.now();
    if (playing) {
      player.pause();
      broadcastTransport(false, t);
    } else {
      player.play();
      broadcastTransport(true, t);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void importFile(f);
  };

  const duration = media?.duration ?? 0;

  return (
    <section className="jp-card p-4" aria-labelledby="media-dock-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="media-dock-title" className="font-display text-lg font-bold">
          Media Dock
        </h3>
        <span className="jp-label">MP3 · YouTube → chords</span>
      </div>

      {!media && (
        <div className="grid gap-3 md:grid-cols-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cx(
              'flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition',
              dragOver ? 'border-accent bg-accent-soft' : 'border-line bg-bg/40',
            )}
          >
            {phase.kind === 'analyzing' ? (
              <>
                <p className="text-sm font-bold">Listening to “{phase.name}”…</p>
                <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-panel">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
                </div>
                <p className="font-mono text-[11px] text-muted">chroma analysis · {Math.round(phase.progress * 100)}%</p>
              </>
            ) : (
              <>
                <span className="text-2xl" aria-hidden>
                  💿
                </span>
                <p className="text-sm font-semibold">Drop an MP3 here</p>
                <button className="jp-btn" onClick={() => fileInput.current?.click()}>
                  Browse audio
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importFile(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>

          <form onSubmit={importYouTube} className="flex flex-col gap-2 rounded-xl border border-line bg-bg/40 p-3">
            <label className="jp-label" htmlFor="yt-url">
              YouTube link
            </label>
            <input
              id="yt-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/…"
              className="jp-input"
            />
            <div className="flex gap-2">
              <input
                value={progression}
                onChange={(e) => setProgression(e.target.value)}
                placeholder="Chords (optional): Am F C G"
                className="jp-input"
                aria-label="Chord progression"
              />
              <input
                type="number"
                min={50}
                max={220}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 96)}
                className="jp-input w-20"
                aria-label="BPM"
              />
            </div>
            <button type="submit" className="jp-btn-accent mt-auto">
              Import link
            </button>
          </form>
        </div>
      )}

      {phase.kind === 'error' && (
        <p role="alert" className="mt-2 rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">
          {phase.message}
        </p>
      )}

      {media && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {media.kind === 'youtube' && (
              <div ref={ytHost} className="aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-black sm:w-44" />
            )}
            {follower && (
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-accent-soft text-xl" title="Following a bandmate's track" aria-hidden>
                🛰️
              </div>
            )}
            {media.kind === 'mp3' && !follower && (
              <audio
                ref={audioRef}
                src={media.src}
                preload="auto"
                onPlay={() => {
                  setPlaying(true);
                  playhead.set({ playing: true });
                }}
                onPause={() => {
                  setPlaying(false);
                  playhead.set({ playing: false, t: audioRef.current?.currentTime ?? 0 });
                }}
                onEnded={() => setPlaying(false)}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{media.title}</p>
              <p className="font-mono text-[11px] text-muted">
                {media.kind.toUpperCase()} · {media.bpm} BPM · {media.chords.length} chord events · {formatTime(duration)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={togglePlay} className="jp-btn-accent w-20" aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.1}
                  value={time}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    player.seek(s);
                    broadcastTransport(playing, s);
                  }}
                  className="jp-fader min-w-0 flex-1"
                  aria-label="Seek backing track"
                />
                <span className="w-10 font-mono text-[11px] tabular-nums text-muted">{formatTime(time)}</span>
              </div>
            </div>
          </div>

          {media.kind === 'youtube' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-bg/40 p-2">
              <span className="jp-label">Progression</span>
              <input
                value={progression}
                onChange={(e) => setProgression(e.target.value)}
                className="jp-input min-w-[140px] flex-1 py-1"
                aria-label="Edit progression"
              />
              <input
                type="number"
                value={bpm}
                min={50}
                max={220}
                onChange={(e) => setBpm(Number(e.target.value) || 96)}
                className="jp-input w-20 py-1"
                aria-label="BPM"
              />
              <button onClick={rechart} className="jp-btn">
                Re-chart
              </button>
            </div>
          )}

          <div className="flex justify-between">
            <p className="text-[11px] text-muted">
              {follower
                ? 'Following a bandmate’s MP3: the chords stay in sync, and the audio plays from their device.'
                : media.kind === 'mp3'
                ? 'Chords detected locally from the audio — nothing uploaded.'
                : 'YouTube audio is cross-origin, so chords follow your progression grid.'}
            </p>
            <button
              onClick={() => {
                player.pause();
                if (media.kind === 'mp3' && !follower) URL.revokeObjectURL(media.src);
                onMedia(null);
              }}
              className="text-xs font-bold text-muted hover:text-danger"
            >
              Eject
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
