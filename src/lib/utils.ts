import type { RGBA } from '../types';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const rgba = (c: RGBA, alphaOverride?: number): string =>
  `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alphaOverride ?? c.a})`;

/** Mix an LED color toward black — used for wall shading. */
export const shade = (c: RGBA, factor: number, alpha = 1): string =>
  rgba({ r: c.r * factor, g: c.g * factor, b: c.b * factor, a: alpha });

export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const timeAgo = (at: number): string => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
};

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

/** Extract an 11-char YouTube video id from the common URL shapes. */
export const parseYouTubeId = (input: string): string | null => {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12) || null;
    if (url.hostname.endsWith('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = url.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch {
    return null;
  }
  return null;
};
