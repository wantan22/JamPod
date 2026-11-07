import type { ChordEvent } from '../types';

/* ------------------------------------------------------------------ */
/*  Pitch-class (chroma) chord recognition                             */
/*  Shared by the live mic analyser and the offline MP3 importer.      */
/* ------------------------------------------------------------------ */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

interface ChordTemplate {
  name: string;
  mask: number[];
}

const buildTemplates = (): ChordTemplate[] => {
  const out: ChordTemplate[] = [];
  for (let root = 0; root < 12; root++) {
    const major = new Array(12).fill(0);
    major[root] = 1;
    major[(root + 4) % 12] = 1;
    major[(root + 7) % 12] = 1;
    out.push({ name: NOTE_NAMES[root], mask: major });

    const minor = new Array(12).fill(0);
    minor[root] = 1;
    minor[(root + 3) % 12] = 1;
    minor[(root + 7) % 12] = 1;
    out.push({ name: `${NOTE_NAMES[root]}m`, mask: minor });
  }
  return out;
};

const TEMPLATES = buildTemplates();

/** Build a 12-bin chroma vector from linear magnitudes of an FFT. */
export function chromaFromMagnitudes(mags: ArrayLike<number>, sampleRate: number, fftSize: number): number[] {
  const chroma = new Array(12).fill(0);
  const binHz = sampleRate / fftSize;
  const minBin = Math.max(1, Math.floor(60 / binHz));
  const maxBin = Math.min(mags.length - 1, Math.ceil(2100 / binHz));
  for (let i = minBin; i <= maxBin; i++) {
    const f = i * binHz;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const m = mags[i];
    chroma[pc] += m * m;
  }
  const max = Math.max(...chroma);
  return max > 0 ? chroma.map((v) => v / max) : chroma;
}

/** Convert the dB spectrum from an AnalyserNode to linear magnitudes. */
export function dbToMagnitudes(db: Float32Array): Float32Array {
  const out = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) out[i] = Number.isFinite(db[i]) ? Math.pow(10, db[i] / 20) : 0;
  return out;
}

export function matchChord(chroma: number[]): { name: string; confidence: number } {
  const energy = chroma.reduce((a, b) => a + b, 0);
  if (energy < 0.4) return { name: 'N.C.', confidence: 0 };
  let best = { name: 'N.C.', confidence: 0 };
  for (const t of TEMPLATES) {
    let inChord = 0;
    let outChord = 0;
    for (let i = 0; i < 12; i++) {
      if (t.mask[i]) inChord += chroma[i];
      else outChord += chroma[i];
    }
    const score = inChord / 3 - outChord / 9;
    if (score > best.confidence) best = { name: t.name, confidence: score };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Minimal in-place radix-2 FFT (used for offline MP3 analysis)       */
/* ------------------------------------------------------------------ */

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const mixToMono = (buffer: AudioBuffer): Float32Array => {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
};

/** Onset-envelope autocorrelation tempo estimate, clamped to 70–170 BPM. */
function estimateBpm(mono: Float32Array, sampleRate: number): number {
  const hop = 512;
  const env: number[] = [];
  let prev = 0;
  for (let i = 0; i + hop < mono.length; i += hop) {
    let e = 0;
    for (let k = 0; k < hop; k++) e += mono[i + k] * mono[i + k];
    env.push(Math.max(0, e - prev));
    prev = e;
  }
  const fps = sampleRate / hop;
  let bestLag = 0;
  let bestVal = -Infinity;
  const minLag = Math.floor((60 / 170) * fps);
  const maxLag = Math.ceil((60 / 70) * fps);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    if (s > bestVal) {
      bestVal = s;
      bestLag = lag;
    }
  }
  return bestLag ? Math.round((60 * fps) / bestLag) : 96;
}

export interface AnalysisResult {
  chords: ChordEvent[];
  bpm: number;
  duration: number;
}

/**
 * Offline chord extraction: chroma per 0.5s segment → template match →
 * merge consecutive duplicates. Yields to the event loop periodically so
 * long files keep the UI responsive.
 */
export async function analyzeBufferChords(
  buffer: AudioBuffer,
  onProgress?: (fraction: number) => void,
): Promise<AnalysisResult> {
  const mono = mixToMono(buffer);
  const sr = buffer.sampleRate;
  const fftSize = 8192;
  const segment = 0.5;
  const segSamples = Math.floor(segment * sr);
  const windowFn = new Float32Array(fftSize).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  const raw: ChordEvent[] = [];
  const total = Math.max(1, Math.floor(mono.length / segSamples));

  for (let s = 0; s < total; s++) {
    const start = s * segSamples;
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    for (let i = 0; i < fftSize && start + i < mono.length; i++) re[i] = mono[start + i] * windowFn[i];
    fft(re, im);
    const mags = new Float32Array(fftSize / 2);
    for (let i = 0; i < mags.length; i++) mags[i] = Math.hypot(re[i], im[i]);
    const { name, confidence } = matchChord(chromaFromMagnitudes(mags, sr, fftSize));
    raw.push({ t: s * segment, d: segment, chord: confidence > 0.12 ? name : 'N.C.' });

    if (s % 40 === 0) {
      onProgress?.(s / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Smooth: majority vote over a 3-segment window, then merge runs.
  const smoothed = raw.map((ev, i) => {
    const neighborhood = [raw[i - 1]?.chord, ev.chord, raw[i + 1]?.chord].filter(Boolean) as string[];
    const counts = new Map<string, number>();
    neighborhood.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { ...ev, chord: winner };
  });

  const merged: ChordEvent[] = [];
  for (const ev of smoothed) {
    const last = merged[merged.length - 1];
    if (last && last.chord === ev.chord) last.d += ev.d;
    else merged.push({ ...ev });
  }

  onProgress?.(1);
  return { chords: merged, bpm: estimateBpm(mono, sr), duration: buffer.duration };
}

/** Turn a typed progression ("Am F C G") into a looping chord chart. */
export function progressionToChart(progression: string[], bpm: number, durationSec: number, beatsPerChord = 4): ChordEvent[] {
  const chords = progression.length ? progression : ['C', 'G', 'Am', 'F'];
  const len = (60 / bpm) * beatsPerChord;
  const out: ChordEvent[] = [];
  for (let t = 0, i = 0; t < durationSec; t += len, i++) out.push({ t, d: len, chord: chords[i % chords.length] });
  return out;
}

/** Deterministic "starter" progression seeded from a YouTube id. */
export function seededProgression(seed: string): string[] {
  const pool = [
    ['C', 'G', 'Am', 'F'],
    ['Am', 'F', 'C', 'G'],
    ['D', 'A', 'Bm', 'G'],
    ['Em', 'C', 'G', 'D'],
    ['F', 'C', 'Dm', 'A#'],
    ['G', 'Em', 'C', 'D'],
  ];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

export const chordAt = (chords: ChordEvent[], t: number): number => {
  let lo = 0;
  let hi = chords.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
};
