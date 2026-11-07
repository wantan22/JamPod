import { useCallback, useEffect, useRef, useState } from 'react';
import type { LaneId } from '../context/LibraryContext';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

const pickMime = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
};

export interface RecordedTake {
  laneId: LaneId;
  blob: Blob;
  url: string;
  mime: string;
  seconds: number;
}

export interface LayerRecorder {
  supported: boolean;
  recordingLane: LaneId | null;
  elapsed: number;
  error: string | null;
  start: (laneId: LaneId, existing?: MediaStream | null) => Promise<boolean>;
  stop: () => Promise<RecordedTake | null>;
}

/** Thin, promise-based wrapper around the native MediaRecorder API. */
export function useLayerRecorder(): LayerRecorder {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ownedStream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const [recordingLane, setRecordingLane] = useState<LaneId | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!recordingLane) return;
    const t = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    return () => clearInterval(t);
  }, [recordingLane]);

  const start = useCallback(
    async (laneId: LaneId, existing?: MediaStream | null) => {
      if (!supported || recorder.current) return false;
      setError(null);
      try {
        let stream = existing ?? null;
        if (!stream || !stream.active) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
          ownedStream.current = stream;
        }
        const mime = pickMime();
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128_000 } : undefined);
        chunks.current = [];
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.start(250);
        recorder.current = rec;
        startedAt.current = performance.now();
        setElapsed(0);
        setRecordingLane(laneId);
        return true;
      } catch (e) {
        setError((e as Error).message || 'Could not start recording');
        return false;
      }
    },
    [supported],
  );

  const stop = useCallback(async (): Promise<RecordedTake | null> => {
    const rec = recorder.current;
    const lane = recordingLane;
    if (!rec || !lane) return null;
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
    rec.stop();
    await done;
    recorder.current = null;
    ownedStream.current?.getTracks().forEach((t) => t.stop());
    ownedStream.current = null;
    setRecordingLane(null);
    const mime = rec.mimeType || 'audio/webm';
    const blob = new Blob(chunks.current, { type: mime });
    if (blob.size === 0) {
      setError('Nothing was captured — check your input device.');
      return null;
    }
    return { laneId: lane, blob, url: URL.createObjectURL(blob), mime, seconds: (performance.now() - startedAt.current) / 1000 };
  }, [recordingLane]);

  useEffect(
    () => () => {
      recorder.current?.state === 'recording' && recorder.current.stop();
      ownedStream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  return { supported, recordingLane, elapsed, error, start, stop };
}
