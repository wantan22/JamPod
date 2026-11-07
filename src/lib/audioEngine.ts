/* ------------------------------------------------------------------ */
/*  Song Studio audio utilities                                         */
/*  - procedural demo stems (so the DAW is playable out of the box)     */
/*  - waveform peak extraction                                           */
/*  - EQ/gain/reverb chain shared by live playback & offline bounce      */
/*  - WAV encoding + gzip compression for "Publish to Blueprint"         */
/* ------------------------------------------------------------------ */

export type DemoKind = 'drums' | 'bass' | 'keys' | 'guitar';

export interface MixSettings {
  gain: number; // 0..1.5
  low: number; // dB -12..12
  mid: number;
  high: number;
  reverb: boolean;
}

export const DEFAULT_MIX: MixSettings = { gain: 0.9, low: 0, mid: 0, high: 0, reverb: false };

const NOTE_FREQ: Record<string, number> = {
  C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63, F: 349.23,
  'F#': 369.99, G: 392.0, 'G#': 415.3, A: 440.0, 'A#': 466.16, B: 493.88,
};

const chordFreqs = (chord: string): number[] => {
  const minor = chord.endsWith('m');
  const root = NOTE_FREQ[minor ? chord.slice(0, -1) : chord] ?? 261.63;
  return [root, root * Math.pow(2, (minor ? 3 : 4) / 12), root * Math.pow(2, 7 / 12)];
};

/** Deterministic PRNG so demo stems sound identical on every client. */
const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Generate a playable demo stem as an AudioBuffer (no context needed). */
export function synthDemoStem(kind: DemoKind, progression: string[], bpm: number, bars: number, sampleRate = 22050): AudioBuffer {
  const beat = 60 / bpm;
  const barLen = beat * 4;
  const duration = bars * barLen;
  const length = Math.ceil(duration * sampleRate);
  const buffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 1 });
  const out = buffer.getChannelData(0);
  const rnd = mulberry(kind.length * 7919 + bpm);

  const add = (start: number, dur: number, fn: (t: number, i: number) => number) => {
    const s0 = Math.floor(start * sampleRate);
    const n = Math.min(length - s0, Math.floor(dur * sampleRate));
    for (let i = 0; i < n; i++) out[s0 + i] += fn(i / sampleRate, i);
  };

  for (let bar = 0; bar < bars; bar++) {
    const chord = progression[bar % progression.length];
    const freqs = chordFreqs(chord);
    const t0 = bar * barLen;

    if (kind === 'drums') {
      for (let b = 0; b < 4; b++) {
        const tb = t0 + b * beat;
        if (b % 2 === 0) add(tb, 0.35, (t) => Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 0.9);
        else add(tb, 0.22, (t) => (rnd() * 2 - 1) * Math.exp(-t * 18) * 0.45 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 25) * 0.3);
        for (let h = 0; h < 2; h++) add(tb + h * (beat / 2), 0.06, (t) => (rnd() * 2 - 1) * Math.exp(-t * 70) * 0.18);
      }
    } else if (kind === 'bass') {
      const f = freqs[0] / 4;
      for (let b = 0; b < 4; b++) {
        const freq = b === 3 ? f * 1.5 : f;
        add(t0 + b * beat, beat * 0.95, (t) => {
          const env = Math.min(1, t * 200) * Math.exp(-t * 2.2);
          return (Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(4 * Math.PI * freq * t) * 0.2) * env * 0.55;
        });
      }
    } else if (kind === 'keys') {
      for (const half of [0, 2]) {
        add(t0 + half * beat, beat * 2, (t) => {
          const env = Math.min(1, t * 80) * Math.exp(-t * 1.4);
          return freqs.reduce((acc, f) => acc + Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t), 0) * env * 0.12;
        });
      }
    } else {
      // guitar: strummed, slightly detuned saw-ish chord
      for (const b of [0, 1.5, 2, 3]) {
        freqs.forEach((f, k) => {
          add(t0 + b * beat + k * 0.012, beat * 1.2, (t) => {
            const ph = (f * 0.5 * t) % 1;
            const env = Math.min(1, t * 300) * Math.exp(-t * 3.5);
            return (ph * 2 - 1) * env * 0.09;
          });
        });
      }
    }
  }

  // soft clip
  for (let i = 0; i < length; i++) out[i] = Math.tanh(out[i]);
  return buffer;
}

/** Downsampled min/max peaks for waveform drawing. */
export function computePeaks(buffer: AudioBuffer, buckets = 600): number[] {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let max = 0;
    const start = b * size;
    for (let i = start; i < start + size && i < data.length; i++) {
      const v = Math.abs(data[i]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const norm = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / norm);
}

/** Generated stereo-ish plate impulse response for the reverb toggle. */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

export interface ChannelStrip {
  input: AudioNode;
  gain: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  wet: GainNode;
  dry: GainNode;
}

/** source → low shelf → mid peak → high shelf → gain → (dry | convolver wet) → dest */
export function buildChannelStrip(ctx: BaseAudioContext, dest: AudioNode, reverbIr: AudioBuffer, mix: MixSettings): ChannelStrip {
  const low = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 220, gain: mix.low });
  const mid = new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1100, Q: 0.9, gain: mix.mid });
  const high = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 4200, gain: mix.high });
  const gain = new GainNode(ctx, { gain: mix.gain });
  const dry = new GainNode(ctx, { gain: 1 });
  const wet = new GainNode(ctx, { gain: mix.reverb ? 0.38 : 0 });
  const conv = new ConvolverNode(ctx, { buffer: reverbIr });
  low.connect(mid).connect(high).connect(gain);
  gain.connect(dry).connect(dest);
  gain.connect(conv).connect(wet).connect(dest);
  return { input: low, gain, low, mid, high, wet, dry };
}

export function applyMix(strip: ChannelStrip, mix: MixSettings, ctx: BaseAudioContext): void {
  const t = ctx.currentTime;
  strip.gain.gain.setTargetAtTime(mix.gain, t, 0.03);
  strip.low.gain.setTargetAtTime(mix.low, t, 0.03);
  strip.mid.gain.setTargetAtTime(mix.mid, t, 0.03);
  strip.high.gain.setTargetAtTime(mix.high, t, 0.03);
  strip.wet.gain.setTargetAtTime(mix.reverb ? 0.38 : 0, t, 0.05);
}

/** Bounce a trimmed + mixed stem offline (exactly what bandmates will hear). */
export async function bounceStem(buffer: AudioBuffer, trimStart: number, trimEnd: number, mix: MixSettings, targetRate = 22050): Promise<AudioBuffer> {
  const startSec = trimStart * buffer.duration;
  const endSec = trimEnd * buffer.duration;
  const tail = mix.reverb ? 1.5 : 0;
  const len = Math.max(1, Math.ceil((endSec - startSec + tail) * targetRate));
  const ctx = new OfflineAudioContext(1, len, targetRate);
  const strip = buildChannelStrip(ctx, ctx.destination, makeImpulse(ctx), mix);
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.connect(strip.input);
  src.start(0, startSec, endSec - startSec);
  return ctx.startRendering();
}

/** 16-bit PCM mono WAV. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const bytes = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

/** gzip via the native CompressionStream (falls back to raw if unsupported). */
export async function compressBlob(blob: Blob): Promise<{ payload: Blob; encoding: 'gzip' | 'identity' }> {
  if (typeof CompressionStream === 'undefined') return { payload: blob, encoding: 'identity' };
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const payload = await new Response(stream).blob();
  return { payload, encoding: 'gzip' };
}
