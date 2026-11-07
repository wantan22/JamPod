import type { SectionKind } from '../types';

/** Muted, analog-tape inspired color blocks for song sections. */
export const SECTION_COLORS: Record<SectionKind, { bg: string; fg: string }> = {
  intro: { bg: '#7FB7BE', fg: '#0f2326' },
  verse: { bg: '#8FB996', fg: '#132315' },
  pre: { bg: '#C9B26B', fg: '#2a2410' },
  chorus: { bg: '#E8B464', fg: '#2b1d07' },
  bridge: { bg: '#C79BD8', fg: '#2a1633' },
  solo: { bg: '#E07A5F', fg: '#2e120a' },
  outro: { bg: '#9AA3B5', fg: '#191c22' },
};

export const SECTION_KINDS: SectionKind[] = ['intro', 'verse', 'pre', 'chorus', 'bridge', 'solo', 'outro'];

export const SECTION_LABEL: Record<SectionKind, string> = {
  intro: 'Intro',
  verse: 'Verse',
  pre: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  solo: 'Solo',
  outro: 'Outro',
};
