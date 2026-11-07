import { createContext, use, type ReactNode } from 'react';
import type { JamSocketApi } from '../hooks/useJamSocket';
import type { AudioProcessorApi } from '../hooks/useAudioProcessor';

/**
 * The "bus" exposes the single socket connection and the single audio graph
 * owned by the dashboard to any nested module (Studio, Importer, Stage…)
 * without prop-drilling or opening duplicate connections.
 */
export interface JamBus {
  socket: JamSocketApi;
  audio: AudioProcessorApi;
}

const JamBusContext = createContext<JamBus | null>(null);

export function JamBusProvider({ value, children }: { value: JamBus; children: ReactNode }) {
  return <JamBusContext value={value}>{children}</JamBusContext>;
}

export function useJamBus(): JamBus {
  const ctx = use(JamBusContext);
  if (!ctx) throw new Error('useJamBus must be used inside <JamBusProvider>');
  return ctx;
}
