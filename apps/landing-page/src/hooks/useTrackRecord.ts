'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import type { DailySnapshot, TrackRecordMeta } from '@zapengine/types/strategy';
import type { PerformanceSummary } from '@/data/track-record-accessor';
import {
  fetchMeta,
  fetchLatestSnapshot,
  fetchSnapshotHistoryEntries,
  computePerformanceSummary,
  verifyCidChain,
  verifyPerformanceMetrics,
  verifySignature,
} from '@/data/track-record-accessor';
import type {
  SignatureVerification,
  SnapshotHistoryEntry,
} from '@/data/track-record-accessor';
import { mockMeta, mockSnapshotEntries } from '@/data/mock-track-record';
import type { StrategyEvent } from '@/data/track-record-events';
import {
  demoStrategyEvents,
  deriveEventsFromSnapshots,
} from '@/data/track-record-events';
import {
  setTrackRecordSource,
  useTrackRecordSource,
} from '@/data/track-record-source';
import type { TrackRecordSource } from '@/data/track-record-source';
import { DEFAULT_HISTORY_LIMIT } from '@/config/track-record';

export interface TrackRecordState {
  meta: TrackRecordMeta | null;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
  /** Trade markers for the NAV chart; source follows the backtest/live split. */
  events: StrategyEvent[];
  positions: DailySnapshot['positions'];
  verification: {
    chainValid: boolean;
    chainBrokenAt: number | undefined;
    totalSnapshots: number;
    signatureValid: boolean;
    signature: SignatureVerification | null;
    performanceValid: boolean;
    performanceErrors: string[];
  };
  isLoading: boolean;
  error: string | null;
}

export interface TrackRecordHookState extends TrackRecordState {
  source: TrackRecordSource;
  setSource: (source: TrackRecordSource) => void;
}

const moduleCache: {
  source: TrackRecordSource | null;
  meta: TrackRecordMeta | null;
  snapshots: DailySnapshot[] | null;
  snapshotEntries: SnapshotHistoryEntry[] | null;
  summary: PerformanceSummary | null;
  latestSnapshot: DailySnapshot | null;
  events: StrategyEvent[] | null;
  verification: TrackRecordState['verification'] | null;
} = {
  source: null,
  meta: null,
  snapshots: null,
  snapshotEntries: null,
  summary: null,
  latestSnapshot: null,
  events: null,
  verification: null,
};

type StateUpdate = (previous: TrackRecordState) => TrackRecordState;

/**
 * Cold live loads walk the whole CID chain and recover a secp256k1 signature,
 * so consumers mounting together share one load instead of each running their own.
 */
const inflight: Record<TrackRecordSource, Promise<StateUpdate> | null> = {
  backtest: null,
  live: null,
};

interface LoadedTrackRecord {
  meta: TrackRecordMeta;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
  events: StrategyEvent[];
}

function initialState(): TrackRecordState {
  return {
    meta: null,
    snapshotEntries: [],
    snapshots: [],
    latestSnapshot: null,
    summary: computePerformanceSummary([]),
    events: [],
    positions: [],
    verification: {
      chainValid: true,
      chainBrokenAt: undefined,
      totalSnapshots: 0,
      signatureValid: true,
      signature: null,
      performanceValid: true,
      performanceErrors: [],
    },
    isLoading: true,
    error: null,
  };
}

async function buildVerification({
  meta,
  snapshotEntries,
  snapshots,
  latestSnapshot,
}: LoadedTrackRecord): Promise<TrackRecordState['verification']> {
  const chainResult = verifyCidChain(snapshotEntries);
  const performanceResult = verifyPerformanceMetrics(snapshots);
  const signature = latestSnapshot
    ? await verifySignature(latestSnapshot, meta.officialSigner ?? '')
    : null;

  return {
    chainValid: chainResult.valid,
    chainBrokenAt: chainResult.brokenAt,
    totalSnapshots: chainResult.totalSnapshots,
    signatureValid: signature?.valid ?? true,
    signature,
    performanceValid: performanceResult.valid,
    performanceErrors: performanceResult.errors,
  };
}

function toLoadedState(
  loaded: LoadedTrackRecord,
  verification: TrackRecordState['verification'],
): TrackRecordState {
  return {
    ...loaded,
    positions: loaded.latestSnapshot?.positions ?? [],
    verification,
    isLoading: false,
    error: null,
  };
}

function cacheLoaded(
  source: TrackRecordSource,
  loaded: LoadedTrackRecord,
  verification: TrackRecordState['verification'],
): void {
  moduleCache.source = source;
  moduleCache.meta = loaded.meta;
  moduleCache.snapshotEntries = loaded.snapshotEntries;
  moduleCache.snapshots = loaded.snapshots;
  moduleCache.summary = loaded.summary;
  moduleCache.latestSnapshot = loaded.latestSnapshot;
  moduleCache.events = loaded.events;
  moduleCache.verification = verification;
}

/** The cached verification is reused: nothing it derives from can change. */
function cachedState(source: TrackRecordSource): TrackRecordState | null {
  const cache = moduleCache;
  if (
    cache.source !== source ||
    !cache.meta ||
    !cache.snapshotEntries ||
    !cache.snapshots ||
    !cache.summary ||
    !cache.events ||
    !cache.verification
  ) {
    return null;
  }

  return toLoadedState(
    {
      meta: cache.meta,
      snapshotEntries: cache.snapshotEntries,
      snapshots: cache.snapshots,
      latestSnapshot: cache.latestSnapshot,
      summary: cache.summary,
      events: cache.events,
    },
    cache.verification,
  );
}

async function loadBacktest(): Promise<StateUpdate> {
  const snapshotEntries = mockSnapshotEntries;
  const snapshots = snapshotEntries.map((entry) => entry.snapshot);
  const latestSnapshot = snapshots[snapshots.length - 1] ?? null;
  const summary = computePerformanceSummary(snapshots);
  const events = demoStrategyEvents();
  const loaded: LoadedTrackRecord = {
    meta: mockMeta,
    snapshotEntries,
    snapshots,
    latestSnapshot,
    summary,
    events,
  };
  const verification = await buildVerification(loaded);

  cacheLoaded('backtest', loaded, verification);
  return () => toLoadedState(loaded, verification);
}

async function loadLive(): Promise<StateUpdate> {
  const meta = await fetchMeta();

  if (!meta.latestSnapshotCid) {
    const loaded: LoadedTrackRecord = {
      meta,
      snapshotEntries: [],
      snapshots: [],
      latestSnapshot: null,
      summary: computePerformanceSummary([]),
      events: [],
    };
    const verification = await buildVerification(loaded);
    cacheLoaded('live', loaded, verification);
    return () => toLoadedState(loaded, verification);
  }

  const latestSnapshot = await fetchLatestSnapshot(meta);
  const snapshotEntries = await fetchSnapshotHistoryEntries(
    meta.latestSnapshotCid,
    DEFAULT_HISTORY_LIMIT,
  );
  const snapshots = snapshotEntries.map((entry) => entry.snapshot);
  const summary = computePerformanceSummary(snapshots);
  const events = deriveEventsFromSnapshots(snapshots);
  const loaded: LoadedTrackRecord = {
    meta,
    snapshotEntries,
    snapshots,
    latestSnapshot,
    summary,
    events,
  };
  const verification = await buildVerification(loaded);

  cacheLoaded('live', loaded, verification);
  return () => toLoadedState(loaded, verification);
}

async function loadTrackRecord(
  source: TrackRecordSource,
): Promise<StateUpdate> {
  try {
    return source === 'backtest' ? await loadBacktest() : await loadLive();
  } catch (err) {
    // Terminal boundary for the selected source. Live failures must stay scoped
    // to Live mode so the default backtest remains usable.
    Sentry.captureException(err, { tags: { component: 'track-record' } });
    return (previous) => ({
      ...previous,
      isLoading: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export function useTrackRecord(): TrackRecordHookState {
  const source = useTrackRecordSource();
  const [state, setState] = useState<TrackRecordState>(() => initialState());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cached = cachedState(source);
      if (cached) {
        if (!cancelled) setState(cached);
        return;
      }

      if (!cancelled) setState(initialState());

      const request = (inflight[source] ??= loadTrackRecord(source).finally(
        () => {
          inflight[source] = null;
        },
      ));
      const update = await request;

      if (!cancelled) {
        setState(update);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return {
    ...state,
    source,
    setSource: setTrackRecordSource,
  };
}
