import { useJamBus } from '../../context/JamBusContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { cx } from '../../lib/utils';

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  const segments = 14;
  const lit = Math.round(value * segments);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 font-mono text-[10px] text-muted">{label}</span>
      <div className="flex flex-1 gap-[3px]" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className="h-2.5 flex-1 rounded-[2px] transition-opacity duration-75"
            style={{
              background: i > segments * 0.8 ? '#e07a5f' : i > segments * 0.6 ? '#e8b464' : color,
              opacity: i < lit ? 1 : 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Integrated Dual Vocal Node: Singing Mode switch + visual of the local
 * frequency-splitter pipeline (instrument gate → chord analysis, vocal band → WebRTC).
 */
export function VocalNode() {
  const { isSinging, setSinging, commMode, activeRole } = useUserPreferences();
  const { audio } = useJamBus();
  const live = audio.status === 'live';

  return (
    <section className="jp-card p-4" aria-labelledby="vocal-node-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="vocal-node-title" className="font-display text-lg font-bold">
          Dual Vocal Node
        </h3>
        <button
          role="switch"
          aria-checked={isSinging}
          onClick={() => setSinging(!isSinging)}
          className="flex items-center gap-2 text-sm font-bold"
        >
          <span className={cx('text-xs', isSinging ? 'text-accent' : 'text-muted')}>Singing mode</span>
          <span className={cx('relative h-6 w-11 rounded-full border border-line transition', isSinging ? 'bg-accent' : 'bg-panel')}>
            <span
              className={cx(
                'absolute top-0.5 size-[18px] rounded-full bg-[#f4f1ea] shadow transition-all',
                isSinging ? 'left-[22px]' : 'left-0.5',
              )}
            />
          </span>
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        {live ? (
          <button onClick={audio.stop} className="jp-btn">
            <span className="size-2 animate-pulse rounded-full bg-danger" /> Mic live — release
          </button>
        ) : (
          <button onClick={() => void audio.start()} className="jp-btn-accent" disabled={audio.status === 'requesting' || audio.status === 'unsupported'}>
            🎙️ {audio.status === 'requesting' ? 'Waiting for permission…' : 'Enable microphone'}
          </button>
        )}
        {audio.status === 'denied' && <span className="text-xs text-danger">Mic blocked — allow it in the address bar.</span>}
        {audio.status === 'unsupported' && <span className="text-xs text-danger">This browser can’t capture audio.</span>}
      </div>

      {/* Pipeline diagram */}
      <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 rounded-xl bg-bg/50 p-3 font-mono text-[10.5px]">
        <span className="row-span-2 grid size-9 place-items-center rounded-lg border border-line text-base">🎤</span>
        <div className="flex items-center gap-1.5 text-muted">
          <span>→</span>
          <span className="rounded bg-panel px-1.5 py-0.5 text-ink">
            {activeRole} gate {audio.activeBand.low}–{audio.activeBand.high >= 1000 ? `${audio.activeBand.high / 1000}k` : audio.activeBand.high} Hz
          </span>
          <span>→ chord analysis</span>
          <span className="ml-auto font-display text-sm font-bold text-accent">{live ? audio.liveChord.name : '—'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted">
          <span>→</span>
          <span className={cx('rounded px-1.5 py-0.5', isSinging || commMode === 'talk' ? 'bg-accent-soft text-ink' : 'bg-panel line-through opacity-60')}>
            vocal band 110–7.5k Hz
          </span>
          <span>→ WebRTC</span>
          <span className="ml-auto">{audio.vocalStream ? `${audio.vocalStream.getAudioTracks().length} track ready` : 'no track'}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Meter label="Inst" value={audio.instrumentLevel} color="#7fb7be" />
        <Meter label="Vocal" value={audio.vocalLevel} color="#8fb996" />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {commMode === 'talk'
          ? 'Talk mode: instruments ducked to 22%, voice boosted for chat.'
          : isSinging
            ? 'A vintage mic has spawned at your station — its aura follows your voice.'
            : 'Voice channel gated. Flip Singing mode to send clean vocals to the band.'}
      </p>
    </section>
  );
}
