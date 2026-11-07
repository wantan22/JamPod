import { useState } from 'react';
import { useJamBus } from '../../context/JamBusContext';
import { useLibrary, useStemAudio, type LaneId, type Song, type Stem } from '../../context/LibraryContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import type { MixSettings } from '../../lib/audioEngine';
import { cx, formatBytes, formatTime } from '../../lib/utils';
import { Knob } from './Knob';
import { Waveform } from './Waveform';

interface TrackLaneProps {
  lane: { id: LaneId; name: string; color: string; emoji: string };
  stem: Stem | undefined;
  song: Song;
  songDuration: number;
  position: number;
  playing: boolean;
  muted: boolean;
  onToggleMute: () => void;
  recording: boolean;
  recordElapsed: number;
  recordDisabled: boolean;
  onRecord: () => void;
  onStopRecord: () => void;
  onSeek: (sec: number) => void;
}

type PublishPhase = { kind: 'idle' } | { kind: 'working'; step: string; progress: number } | { kind: 'error'; message: string };

export function TrackLane({
  lane,
  stem,
  song,
  songDuration,
  position,
  playing,
  muted,
  onToggleMute,
  recording,
  recordElapsed,
  recordDisabled,
  onRecord,
  onStopRecord,
  onSeek,
}: TrackLaneProps) {
  const { dispatch, bandId } = useLibrary();
  const { socket } = useJamBus();
  const { me } = useUserPreferences();
  const { buffer, peaks, error: audioError } = useStemAudio(stem, song);
  const [publish, setPublish] = useState<PublishPhase>({ kind: 'idle' });

  const stemDuration = buffer?.duration ?? 0;
  const widthPct = stemDuration ? Math.min(100, (stemDuration / songDuration) * 100) : 100;
  const playFrac = stemDuration && (playing || position > 0) ? position / stemDuration : null;

  const setMix = (patch: Partial<MixSettings>) => {
    if (!stem) return;
    dispatch({ type: 'stem/update', laneId: lane.id, patch: { mix: { ...stem.mix, ...patch } } });
  };

  /**
   * Publish = upload the original compressed take (Opus/AAC from MediaRecorder,
   * roughly 1 MB per minute) so the whole band can play it. Trim and mixer
   * settings stay non-destructive and sync separately, so they can still be changed.
   */
  const doPublish = async () => {
    if (!stem || stem.source.type !== 'recording') return;
    const source = stem.source;
    try {
      setPublish({ kind: 'working', step: 'Preparing', progress: 0.02 });
      const blob = await fetch(source.blobUrl).then((r) => r.blob());
      const result = await uploadWithProgress(`/api/bands/${encodeURIComponent(bandId)}/audio`, blob, source.mime, (f) =>
        setPublish({ kind: 'working', step: `Uploading ${formatBytes(blob.size * f)} of ${formatBytes(blob.size)}`, progress: 0.05 + f * 0.95 }),
      );
      dispatch({
        type: 'stem/update',
        laneId: lane.id,
        patch: {
          source: { type: 'shared', url: result.url, mime: source.mime },
          published: { bytes: result.size, at: Date.now(), by: me.displayName },
        },
      });
      socket.sendEphemeral({ kind: 'publish', memberId: me.id, trackName: `${song.title} · ${lane.name}`, bytes: result.size });
      socket.log(`Published ${lane.name} to the band (${formatBytes(result.size)})`, 'studio', 'you');
      setPublish({ kind: 'idle' });
    } catch (e) {
      setPublish({ kind: 'error', message: (e as Error).message });
    }
  };

  return (
    <div className={cx('grid gap-3 rounded-xl border border-line bg-surface/60 p-3 lg:grid-cols-[150px_1fr_370px]', recording && 'ring-2 ring-danger/70')}>
      {/* Channel header */}
      <div className="flex items-center gap-2 lg:flex-col lg:items-start">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg text-base" style={{ background: `${lane.color}33` }} aria-hidden>
            {lane.emoji}
          </span>
          <div>
            <p className="text-sm font-extrabold">{lane.name}</p>
            <p className="text-[10px] text-muted">{stem ? `by ${stem.author}` : 'empty'}</p>
          </div>
        </div>
        <div className="ml-auto flex gap-1.5 lg:ml-0">
          {recording ? (
            <button onClick={onStopRecord} className="jp-btn border-danger/60 text-danger" aria-label={`Stop recording ${lane.name}`}>
              <span className="size-2 animate-pulse rounded-full bg-danger" />
              {formatTime(recordElapsed)} ■
            </button>
          ) : (
            <button onClick={onRecord} disabled={recordDisabled} className="jp-btn" aria-label={`Record layer on ${lane.name}`}>
              <span className="size-2 rounded-full bg-danger" /> Record Layer
            </button>
          )}
          <button
            onClick={onToggleMute}
            aria-pressed={muted}
            className={cx('jp-btn w-8 px-0 text-xs', muted && 'bg-danger/20 text-danger')}
            title={muted ? 'Unmute' : 'Mute'}
          >
            M
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="min-w-0">
        {stem ? (
          <div style={{ width: `${widthPct}%` }}>
            {audioError ? (
              <div className="grid h-14 place-items-center rounded-lg border border-dashed border-line px-3 text-center text-xs text-muted">
                🎙️ {audioError}
              </div>
            ) : peaks.length ? (
              <Waveform
                peaks={peaks}
                color={lane.color}
                trimStart={stem.trimStart}
                trimEnd={stem.trimEnd}
                duration={stemDuration}
                playFrac={playFrac}
                onTrimCommit={(trimStart, trimEnd) => dispatch({ type: 'stem/update', laneId: lane.id, patch: { trimStart, trimEnd } })}
                onSeek={(f) => onSeek(f * stemDuration)}
              />
            ) : (
              <div className="h-14 animate-pulse rounded-lg bg-panel/60" />
            )}
          </div>
        ) : (
          <div className="grid h-14 place-items-center rounded-lg border border-dashed border-line text-xs text-muted">
            {recording ? 'Recording… play along with the band' : 'No take yet — hit Record Layer to lay one down'}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
          {stem?.source.type === 'shared' ? (
            <span className="rounded bg-ok/15 px-1.5 py-0.5 font-mono text-ok" title="Stored on the server; every bandmate can play it">
              ☁ shared with the band{stem.published ? ` · ${formatBytes(stem.published.bytes)} · by ${stem.published.by}` : ''}
            </span>
          ) : stem?.source.type === 'recording' ? (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-accent" title="Only on the recording device until published">
              ✎ draft · only on {stem.author}’s device
            </span>
          ) : stem ? (
            <span className="font-mono">demo stem · plays for everyone</span>
          ) : null}
          {publish.kind === 'working' && (
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-20 overflow-hidden rounded bg-panel">
                <span className="block h-full bg-accent transition-[width]" style={{ width: `${publish.progress * 100}%` }} />
              </span>
              {publish.step}
            </span>
          )}
          {publish.kind === 'error' && <span className="text-danger">Publish failed: {publish.message}</span>}
          {stem && (
            <button
              className="ml-auto font-bold hover:text-danger"
              onClick={() => dispatch({ type: 'stem/set', laneId: lane.id, stem: null })}
              aria-label={`Remove ${lane.name} take`}
            >
              remove take
            </button>
          )}
        </div>
      </div>

      {/* Mixer */}
      <div className={cx('flex items-center gap-2.5', !stem && 'pointer-events-none opacity-40')}>
        <label className="flex flex-col items-center gap-0.5" title="Volume gain">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={stem?.mix.gain ?? 0.9}
            onChange={(e) => setMix({ gain: Number(e.target.value) })}
            className="jp-fader h-14 w-4"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            aria-label={`${lane.name} volume gain`}
          />
          <span className="font-mono text-[9px] tracking-wider text-muted uppercase">Gain</span>
        </label>
        <Knob label="Low" value={stem?.mix.low ?? 0} min={-12} max={12} color={lane.color} onChange={(low) => setMix({ low })} />
        <Knob label="Mid" value={stem?.mix.mid ?? 0} min={-12} max={12} color={lane.color} onChange={(mid) => setMix({ mid })} />
        <Knob label="High" value={stem?.mix.high ?? 0} min={-12} max={12} color={lane.color} onChange={(high) => setMix({ high })} />
        <button
          role="switch"
          aria-checked={!!stem?.mix.reverb}
          onClick={() => setMix({ reverb: !stem?.mix.reverb })}
          className={cx(
            'flex flex-col items-center rounded-lg border px-1.5 py-1 text-[9px] font-extrabold tracking-wider uppercase transition',
            stem?.mix.reverb ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted',
          )}
        >
          <span className={cx('mb-0.5 size-2 rounded-full', stem?.mix.reverb ? 'bg-accent shadow-[0_0_6px_var(--jp-accent)]' : 'bg-panel-2')} />
          Verb
        </button>
        <button
          onClick={() => void doPublish()}
          disabled={stem?.source.type !== 'recording' || !buffer || publish.kind === 'working'}
          className="jp-btn-accent px-2.5 text-xs"
          title={
            stem?.source.type === 'recording'
              ? 'Upload this take so the whole band can hear it'
              : 'Already shared: mixer and trim changes sync automatically'
          }
        >
          {publish.kind === 'working' ? 'Publishing…' : stem?.source.type === 'recording' ? 'Publish to Blueprint' : '✓ Shared'}
        </button>
      </div>
    </div>
  );
}

/** POST a blob with upload progress (fetch can't report upload progress). */
function uploadWithProgress(
  url: string,
  blob: Blob,
  mime: string,
  onProgress: (fraction: number) => void,
): Promise<{ id: string; url: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', mime);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { id?: string; url?: string; size?: number; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body as { id: string; url: string; size: number });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and try again.'));
    xhr.send(blob);
  });
}
