'use client';

import { useSyncExternalStore } from 'react';

export type TrackRecordSource = 'backtest' | 'live';

let currentSource: TrackRecordSource = 'backtest';
const listeners = new Set<() => void>();

export function setTrackRecordSource(source: TrackRecordSource): void {
  if (source === currentSource) return;
  currentSource = source;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TrackRecordSource {
  return currentSource;
}

function getServerSnapshot(): TrackRecordSource {
  return 'backtest';
}

export function useTrackRecordSource(): TrackRecordSource {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
