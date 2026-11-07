import { useState } from 'react';
import { useJamBus } from '../../context/JamBusContext';
import { useLibrary, useStemAudio, type LaneId, type Song, type Stem } from '../../context/LibraryContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { bounceStem, compressBlob, encodeWav, type MixSettings } from '../../lib/audioEngine';
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
  const { dispatch, activeVersion } = useLibrary();
  const { socket } = useJamBus();
  const { me, roomChannelId } = useUserPreferences();
  const { buffer, peaks } = useStemAudio(stem, song);
  const [publish, setPublish] = useState<PublishPhase>({ kind: 'idle' });

  const stemDuration = buffer?.duration ?? 0;
  const widthPct = stemDuration ? Math.min(100, (stemDuration / songDuration) * 100) : 100;
  const playFrac = stemDuration && (playing || position > 0) ? position / stemDuration : null;

  const setMix = (patch: Partial<MixSettings>) => {
    if (!stem) return;
    dispatch({ type: 'stem/update', laneId: lane.id, patch: { mix: { ...stem.mix, ...patch } } });
  };

  const doPublish = async () => {
    if (!stem || !buffer) return;
    try {
      setPublish({ kind: 'working', step: 'Bouncing mix', progress: 0.1 });
      const bounced = await bounceStem(buffer, stem.trimStart, stem.trimEnd, stem.mix);
      setPublish({ kind: 'working', step: 'Encoding WAV 16-bit / 22 kHz', progress: 0.35 });
      const wav = encodeWav(bounced);
      setPublish({ kind: 'working', step: 'Compressing', progress: 0.5 });
      const { payload, encoding } = await compressBlob(wav);
      const path = `bands/${roomChannelId}/songs/${song.id}/${activeVersion.id}/${lane.id}.wav${encoding === 'gzip' ? '.gz' : ''}`;

      // Mock bucket upload — swap for a signed-URL PUT (S3/GCS/Supabase Storage).
      const chunks = 8;
      for (let i = 1; i <= chunks; i++) {
        await new Promise((r) => setTimeout(r, 90 + Math.random() * 80));
        setPublish({ kind: 'working', step: `Uploading ${formatBytes((payload.size * i) / chunks)}`, progress: 0.5 + (0.5 * i) / chunks });
      }

      const rawBytes = Math.round(buffer.length * buffer.numberOfChannels * 4);
      dispatch({
        type: 'stem/update',
        laneId: lane.id,
        patch: { published: { rawBytes, payloadBytes: payload.size, encoding, path, at: Date.now() } },
      });
      socket.sendEphemeral({ kind: 'publish', memberId: me.id, trackName: `${song.title} · ${lane.name}`, bytes: payload.size });
      socket.log(`Published ${lane.name} to blueprint (${formatBytes(payload.size)}, ${encoding})`, 'studio', 'you');
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
            {peaks.length ? (
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
          {stem?.published ? (
            <span className="rounded bg-ok/15 px-1.5 py-0.5 font-mono text-ok" title={stem.published.path}>
              ☁ published · {formatBytes(stem.published.payloadBytes)} ({Math.round((1 - stem.published.payloadBytes / stem.published.rawBytes) * 100)}% smaller)
            </span>
          ) : stem ? (
            <span className="font-mono">draft · {stem.source.type === 'recording' ? 'browser take' : 'demo stem'}</span>
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
          disabled={!stem || !buffer || publish.kind === 'working' || !!stem?.published}
          className="jp-btn-accent px-2.5 text-xs"
          title="Bounce, compress, and upload this layer"
        >
          {stem?.published ? '✓ Synced' : 'Publish to Blueprint'}
        </button>
      </div>
    </div>
  );
}
