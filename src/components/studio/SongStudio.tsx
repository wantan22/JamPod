import { useState } from 'react';
import { useJamBus } from '../../context/JamBusContext';
import { LANES, useLibrary, type LaneId, type SyncStatus } from '../../context/LibraryContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { useLayerRecorder } from '../../hooks/useLayerRecorder';
import { useStudioPlayback } from '../../hooks/useStudioPlayback';
import { DEFAULT_MIX } from '../../lib/audioEngine';
import { SECTION_COLORS } from '../../lib/sections';
import { cx, formatTime, uid } from '../../lib/utils';
import { TrackLane } from './TrackLane';

/**
 * Module 2 — The Song Blueprint. Asynchronous multi-track workspace:
 * section chips, per-lane Record Layer, waveform trims, inline mixer,
 * and Publish to Blueprint.
 */
export function SongStudio() {
  const lib = useLibrary();
  const { activeSong: song, activeVersion: version, songs, dispatch, queueList, queue } = lib;
  const { commMode, me } = useUserPreferences();
  const { audio, socket } = useJamBus();
  const [muted, setMuted] = useState<Partial<Record<LaneId, boolean>>>({});
  const [forking, setForking] = useState(false);
  const [forkLabel, setForkLabel] = useState('');

  const transport = useStudioPlayback(song, version, muted, commMode === 'talk' ? 0.25 : 1);
  const recorder = useLayerRecorder();
  const barSec = 4 * (60 / song.bpm);

  const startRecording = async (laneId: LaneId) => {
    const ok = await recorder.start(laneId, audio.rawStream);
    if (ok) {
      socket.log(`Recording ${laneId} layer on "${song.title}"`, 'studio', 'you');
      void transport.play(0, { exclude: laneId }); // overdub against the band
    }
  };

  const stopRecording = async () => {
    transport.stop();
    const take = await recorder.stop();
    if (!take) return;
    dispatch({
      type: 'stem/set',
      laneId: take.laneId,
      stem: {
        id: uid('stem'),
        laneId: take.laneId,
        source: { type: 'recording', blobUrl: take.url, mime: take.mime },
        trimStart: 0,
        trimEnd: 1,
        mix: { ...DEFAULT_MIX },
        author: me.displayName,
        createdAt: Date.now(),
      },
    });
    socket.log(`Captured ${take.seconds.toFixed(1)}s ${take.laneId} take — trim & publish when ready`, 'studio', 'you');
  };

  const submitFork = () => {
    const label = forkLabel.trim() || `${version.label} (alt)`;
    lib.forkVersion(label, `Forked by ${me.displayName}`);
    socket.log(`Saved new version "${label}" of ${song.title}`, 'studio', 'you');
    setForkLabel('');
    setForking(false);
  };

  const pct = (sec: number) => `${(sec / transport.songDuration) * 100}%`;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="studio-title">
      {/* Header */}
      <div className="jp-card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0">
          <p className="jp-label flex items-center gap-2">
            Song blueprint · shared with your band
            <SyncBadge status={lib.sync} error={lib.syncError} />
          </p>
          <h2 id="studio-title" className="font-display text-2xl font-bold">
            {song.title}
          </h2>
          <p className="font-mono text-[11px] text-muted">
            {song.key} · {song.bpm} BPM · {song.progression.join(' – ')}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="song-select">
            Song
          </label>
          <select id="song-select" value={song.id} onChange={(e) => dispatch({ type: 'song/select', songId: e.target.value })} className="jp-input w-auto py-1.5">
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="version-select">
            Version
          </label>
          <select
            id="version-select"
            value={version.id}
            onChange={(e) => dispatch({ type: 'version/select', versionId: e.target.value })}
            className="jp-input w-auto py-1.5"
          >
            {song.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          {forking ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitFork();
              }}
              className="flex gap-1.5"
            >
              <input autoFocus value={forkLabel} onChange={(e) => setForkLabel(e.target.value)} placeholder="Version name" className="jp-input w-40 py-1.5" />
              <button className="jp-btn-accent">Save</button>
              <button type="button" className="jp-btn" onClick={() => setForking(false)}>
                ✕
              </button>
            </form>
          ) : (
            <button onClick={() => setForking(true)} className="jp-btn">
              ⑂ Save as version
            </button>
          )}
        </div>

        {queueList && queue && (
          <div className="flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs">
            <span className="font-bold">Setlist: {queueList.name}</span>
            <span className="text-muted">
              song {queue.index + 1} of {queueList.songIds.length}
            </span>
            <div className="ml-auto flex gap-1">
              <button className="jp-btn py-1 text-xs" disabled={queue.index === 0} onClick={() => dispatch({ type: 'queue/step', dir: -1 })}>
                ◀ Prev
              </button>
              <button
                className="jp-btn-accent py-1 text-xs"
                disabled={queue.index >= queueList.songIds.length - 1}
                onClick={() => dispatch({ type: 'queue/step', dir: 1 })}
              >
                Next ▶
              </button>
              <button className="jp-btn py-1 text-xs" onClick={() => dispatch({ type: 'queue/clear' })}>
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transport + section ruler */}
      <div data-tour="studio-transport" className="jp-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => (transport.playing ? transport.stop() : void transport.play())}
            disabled={!!recorder.recordingLane}
            className="jp-btn-accent w-24"
          >
            {transport.playing ? '■ Stop' : '▶ Play'}
          </button>
          <button onClick={() => transport.seek(0)} className="jp-btn" aria-label="Return to start">
            ⏮
          </button>
          <span className="font-mono text-sm tabular-nums">
            {formatTime(transport.position)} <span className="text-muted">/ {formatTime(transport.songDuration)}</span>
          </span>
          <span className="ml-auto hidden text-[11px] text-muted md:inline">
            Click a section or waveform to jump · drag brackets to trim
          </span>
        </div>

        {/* -mx-1 aligns this grid with the lane grids (border + p-3) below */}
        <div className="-mx-1 lg:grid lg:grid-cols-[150px_1fr_370px] lg:gap-3">
          <div className="hidden lg:block" />
          <div className="relative">
            <div className="flex h-9">
              {song.sections.map((sec) => {
                const start = sec.startBar * barSec;
                const active = transport.position >= start && transport.position < start + sec.bars * barSec;
                const c = SECTION_COLORS[sec.kind];
                return (
                  <button
                    key={sec.id}
                    onClick={() => transport.seek(start)}
                    className={cx(
                      'relative shrink-0 rounded-lg border-r-2 border-surface px-2 text-left text-xs font-extrabold transition',
                      active ? 'ring-2 ring-ink/70 ring-inset' : 'opacity-80 hover:opacity-100',
                    )}
                    style={{ width: pct(sec.bars * barSec), background: c.bg, color: c.fg }}
                  >
                    <span className="block truncate">{sec.label}</span>
                    <span className="absolute right-1.5 bottom-0.5 font-mono text-[9px] font-medium opacity-70">{sec.bars} bars</span>
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: pct(transport.position) }} />
          </div>
          <div className="hidden lg:block" />
        </div>
      </div>

      {recorder.error && (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-xs font-semibold text-danger">
          {recorder.error}
        </p>
      )}
      {!recorder.supported && (
        <p className="rounded-lg bg-panel px-3 py-2 text-xs text-muted">This browser can’t record audio (MediaRecorder unavailable).</p>
      )}

      {/* Lanes */}
      <div data-tour="studio-lanes" className="flex flex-col gap-2">
        {LANES.map((lane) => (
          <TrackLane
            key={`${version.id}-${lane.id}`}
            lane={lane}
            stem={version.stems[lane.id]}
            song={song}
            songDuration={transport.songDuration}
            position={transport.position}
            playing={transport.playing}
            muted={!!muted[lane.id]}
            onToggleMute={() => setMuted((m) => ({ ...m, [lane.id]: !m[lane.id] }))}
            recording={recorder.recordingLane === lane.id}
            recordElapsed={recorder.elapsed}
            recordDisabled={!recorder.supported || (recorder.recordingLane !== null && recorder.recordingLane !== lane.id)}
            onRecord={() => void startRecording(lane.id)}
            onStopRecord={() => void stopRecording()}
            onSeek={transport.seek}
          />
        ))}
      </div>
    </section>
  );
}

const SYNC_LABEL: Record<SyncStatus, { text: string; cls: string }> = {
  loading: { text: 'loading…', cls: 'bg-panel text-muted' },
  saved: { text: '✓ saved', cls: 'bg-ok/15 text-ok' },
  saving: { text: 'saving…', cls: 'bg-accent-soft text-accent' },
  offline: { text: 'offline · changes kept', cls: 'bg-danger/15 text-danger' },
  error: { text: 'not saved', cls: 'bg-danger/15 text-danger' },
};

/** Tiny status pill for the band library's cloud sync. */
function SyncBadge({ status, error }: { status: SyncStatus; error: string | null }) {
  const s = SYNC_LABEL[status];
  return (
    <span className={cx('rounded-full px-2 py-0.5 font-mono text-[9px] tracking-normal normal-case', s.cls)} title={error ?? undefined} role="status">
      {s.text}
    </span>
  );
}
