import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommMode, InstrumentRole } from '../types';
import { chromaFromMagnitudes, dbToMagnitudes, matchChord } from '../lib/chords';

/* ------------------------------------------------------------------ */
/*  Audio graph                                                        */
/*                                                                     */
/*   mic ─┬─► [instrument gate: HPF → LPF] ─► instGain ─► instAnalyser  */
/*        │                                       (chroma → liveChord) */
/*        └─► [vocal band: HPF → presence → LPF] ─► vocalGain ─┬─► vocalAnalyser (aura)
/*                                                             └─► MediaStreamDestination
/*                                                                 (clean voice → WebRTC)
/* ------------------------------------------------------------------ */

/** Frequency gate per instrument role — tuned to the instrument's body. */
export const ROLE_BANDS: Record<InstrumentRole, { low: number; high: number; note: string }> = {
  drums: { low: 40, high: 12000, note: 'Full-range gate (kick → cymbals)' },
  keys: { low: 80, high: 5000, note: 'Piano fundamentals + harmonics' },
  bass: { low: 35, high: 800, note: 'Low-end only, rejects vocal band' },
  guitar: { low: 80, high: 5500, note: 'Guitar body + pick attack' },
};

/** Human voice band used for the WebRTC singing channel. */
const VOCAL_BAND = { low: 110, high: 7500, presenceHz: 2800 };

export type MicStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

export interface AudioProcessorOptions {
  role: InstrumentRole;
  commMode: CommMode;
  singing: boolean;
  onLog?: (text: string) => void;
}

export interface AudioProcessorApi {
  status: MicStatus;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** 0..1 RMS of the clean vocal channel (drives the volumetric aura). */
  vocalLevel: number;
  /** 0..1 RMS of the instrument-gated channel. */
  instrumentLevel: number;
  /** Chord detected from the instrument channel in real time. */
  liveChord: { name: string; confidence: number };
  /** Clean vocal MediaStream ready to hand to RTCPeerConnection.addTrack(). */
  vocalStream: MediaStream | null;
  /** Raw mic stream (for recorders). */
  rawStream: MediaStream | null;
  activeBand: { low: number; high: number; note: string };
  getContext: () => AudioContext | null;
}

interface Graph {
  ctx: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  instHpf: BiquadFilterNode;
  instLpf: BiquadFilterNode;
  instGain: GainNode;
  instAnalyser: AnalyserNode;
  vocHpf: BiquadFilterNode;
  vocPresence: BiquadFilterNode;
  vocLpf: BiquadFilterNode;
  vocalGain: GainNode;
  vocalAnalyser: AnalyserNode;
  vocalDest: MediaStreamAudioDestinationNode;
}

const rms = (buf: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
};

/** Gain targets for each comm mode. Talk ducks instruments, boosts voice. */
const gainTargets = (mode: CommMode, singing: boolean) => ({
  instrument: mode === 'jam' ? 1 : 0.22,
  vocal: mode === 'talk' ? 1.45 : singing ? 1 : 0,
});

export function useAudioProcessor({ role, commMode, singing, onLog }: AudioProcessorOptions): AudioProcessorApi {
  const graph = useRef<Graph | null>(null);
  const raf = useRef<number>(0);
  const logRef = useRef(onLog);
  logRef.current = onLog;
  /** Latest params, read by start() so a late mic grant uses current settings. */
  const params = useRef({ role, commMode, singing });
  params.current = { role, commMode, singing };

  const [status, setStatus] = useState<MicStatus>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'idle' : 'unsupported',
  );
  const [error, setError] = useState<string | null>(null);
  const [vocalLevel, setVocalLevel] = useState(0);
  const [instrumentLevel, setInstrumentLevel] = useState(0);
  const [liveChord, setLiveChord] = useState({ name: '—', confidence: 0 });
  const [vocalStream, setVocalStream] = useState<MediaStream | null>(null);
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);

  /* ---------- metering loop (throttled to ~20 fps for React) ---------- */
  const startMetering = useCallback((g: Graph) => {
    const timeBufV = new Float32Array(g.vocalAnalyser.fftSize);
    const timeBufI = new Float32Array(g.instAnalyser.fftSize);
    const freqBuf = new Float32Array(g.instAnalyser.frequencyBinCount);
    let lastUi = 0;
    let lastChord = 0;

    const tick = (now: number) => {
      raf.current = requestAnimationFrame(tick);
      if (now - lastUi < 50) return;
      lastUi = now;

      g.vocalAnalyser.getFloatTimeDomainData(timeBufV);
      g.instAnalyser.getFloatTimeDomainData(timeBufI);
      setVocalLevel(Math.min(1, rms(timeBufV) * 6));
      const instRms = rms(timeBufI);
      setInstrumentLevel(Math.min(1, instRms * 6));

      if (now - lastChord > 250) {
        lastChord = now;
        if (instRms > 0.01) {
          g.instAnalyser.getFloatFrequencyData(freqBuf);
          const chroma = chromaFromMagnitudes(dbToMagnitudes(freqBuf), g.ctx.sampleRate, g.instAnalyser.fftSize);
          setLiveChord(matchChord(chroma));
        } else {
          setLiveChord({ name: '—', confidence: 0 });
        }
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  /* ---------- acquisition ---------- */
  const start = useCallback(async () => {
    if (graph.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    setError(null);
    const { role, commMode, singing } = params.current;
    try {
      // Raw-ish capture: instruments hate AGC/noise suppression pumping.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      const source = ctx.createMediaStreamSource(stream);

      const band = ROLE_BANDS[role];
      const instHpf = new BiquadFilterNode(ctx, { type: 'highpass', frequency: band.low, Q: 0.707 });
      const instLpf = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: band.high, Q: 0.707 });
      const instGain = new GainNode(ctx, { gain: 1 });
      const instAnalyser = new AnalyserNode(ctx, { fftSize: 8192, smoothingTimeConstant: 0.6 });

      const vocHpf = new BiquadFilterNode(ctx, { type: 'highpass', frequency: VOCAL_BAND.low, Q: 0.9 });
      const vocPresence = new BiquadFilterNode(ctx, {
        type: 'peaking',
        frequency: VOCAL_BAND.presenceHz,
        Q: 1.1,
        gain: 3,
      });
      const vocLpf = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: VOCAL_BAND.high, Q: 0.707 });
      const vocalGain = new GainNode(ctx, { gain: 0 });
      const vocalAnalyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.5 });
      const vocalDest = ctx.createMediaStreamDestination();

      source.connect(instHpf).connect(instLpf).connect(instGain).connect(instAnalyser);
      source.connect(vocHpf).connect(vocPresence).connect(vocLpf).connect(vocalGain);
      vocalGain.connect(vocalAnalyser);
      vocalGain.connect(vocalDest);

      const g: Graph = {
        ctx,
        stream,
        source,
        instHpf,
        instLpf,
        instGain,
        instAnalyser,
        vocHpf,
        vocPresence,
        vocLpf,
        vocalGain,
        vocalAnalyser,
        vocalDest,
      };
      graph.current = g;

      const targets = gainTargets(commMode, singing);
      instGain.gain.value = targets.instrument;
      vocalGain.gain.value = targets.vocal;

      setRawStream(stream);
      setVocalStream(vocalDest.stream);
      setStatus('live');
      logRef.current?.(`Mic live @ ${ctx.sampleRate / 1000} kHz — ${role} gate ${band.low}–${band.high} Hz`);
      startMetering(g);
    } catch (e) {
      const err = e as DOMException;
      setStatus(err.name === 'NotAllowedError' ? 'denied' : 'idle');
      setError(err.message || 'Microphone unavailable');
      logRef.current?.(`Mic error: ${err.name}`);
    }
  }, [startMetering]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const g = graph.current;
    if (!g) return;
    g.stream.getTracks().forEach((t) => t.stop());
    void g.ctx.close();
    graph.current = null;
    setRawStream(null);
    setVocalStream(null);
    setVocalLevel(0);
    setInstrumentLevel(0);
    setLiveChord({ name: '—', confidence: 0 });
    setStatus('idle');
    logRef.current?.('Mic released');
  }, []);

  /* ---------- instrument hot-swap: re-tune the frequency gate ---------- */
  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    const band = ROLE_BANDS[role];
    const t = g.ctx.currentTime;
    g.instHpf.frequency.setTargetAtTime(band.low, t, 0.08);
    g.instLpf.frequency.setTargetAtTime(band.high, t, 0.08);
    logRef.current?.(`Gate re-tuned for ${role}: ${band.low}–${band.high} Hz`);
  }, [role]);

  /* ---------- jam/talk ducking + singing gate ---------- */
  useEffect(() => {
    const g = graph.current;
    if (!g) return;
    const targets = gainTargets(commMode, singing);
    const t = g.ctx.currentTime;
    g.instGain.gain.setTargetAtTime(targets.instrument, t, 0.12);
    g.vocalGain.gain.setTargetAtTime(targets.vocal, t, 0.06);
  }, [commMode, singing]);

  useEffect(() => () => stop(), [stop]);

  return {
    status,
    error,
    start,
    stop,
    vocalLevel,
    instrumentLevel,
    liveChord,
    vocalStream,
    rawStream,
    activeBand: ROLE_BANDS[role],
    getContext: () => graph.current?.ctx ?? null,
  };
}
