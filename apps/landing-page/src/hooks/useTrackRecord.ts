'use client';

import { useEffect, useRef, useState } from 'react';
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
import {
  isTrackRecordMockEnabled,
  mockMeta,
  mockSnapshotEntries,
} from '@/data/mock-track-record';
import type { StrategyEvent } from '@/data/track-record-events';
import {
  demoStrategyEvents,
  deriveEventsFromSnapshots,
} from '@/data/track-record-events';
import { DEFAULT_HISTORY_LIMIT } from '@/config/track-record';

export interface TrackRecordState {
  meta: TrackRecordMeta | null;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
  /** Trade markers for the NAV chart; source follows the demo/live split. */
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

const moduleCache: {
  meta: TrackRecordMeta | null;
  snapshots: DailySnapshot[] | null;
  snapshotEntries: SnapshotHistoryEntry[] | null;
  summary: PerformanceSummary | null;
  latestSnapshot: DailySnapshot | null;
  events: StrategyEvent[] | null;
  verification: TrackRecordState['verification'] | null;
} = {
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
 * Cold loads walk the whole CID chain and recover a secp256k1 signature, so
 * consumers mounting together share one load instead of each running their own.
 */
let inflight: Promise<StateUpdate> | null = null;

interface LoadedTrackRecord {
  meta: TrackRecordMeta;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
  events: StrategyEvent[];
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
  loaded: LoadedTrackRecord,
  verification: TrackRecordState['verification'],
): void {
  moduleCache.meta = loaded.meta;
  moduleCache.snapshotEntries = loaded.snapshotEntries;
  moduleCache.snapshots = loaded.snapshots;
  moduleCache.summary = loaded.summary;
  moduleCache.latestSnapshot = loaded.latestSnapshot;
  moduleCache.events = loaded.events;
  moduleCache.verification = verification;
}

/** The cached verification is reused: nothing it derives from can change. */
function cachedState(): TrackRecordState | null {
  const cache = moduleCache;
  if (
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

async function loadTrackRecord(): Promise<StateUpdate> {
  try {
    const meta = await fetchMeta();

    if (!meta.latestSnapshotCid) {
      // No live snapshot published yet. Fall back to demo data so the whole
      // UI is reviewable; self-retires once a real CID lands. See
      // src/data/mock-track-record.ts.
      if (isTrackRecordMockEnabled()) {
        const snapshotEntries = mockSnapshotEntries;
        const snapshots = snapshotEntries.map((entry) => entry.snapshot);
        const latestSnapshot = snapshots[snapshots.length - 1] ?? null;
        const summary = computePerformanceSummary(snapshots);
        // The demo curve is a real backtest, so its markers come from that
        // same run rather than being re-derived from the synthesised
        // snapshots.
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

        cacheLoaded(loaded, verification);

        return () => toLoadedState(loaded, verification);
      }

      moduleCache.meta = meta;
      return (previous) => ({
        ...previous,
        meta,
        isLoading: false,
        error: null,
      });
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

    cacheLoaded(loaded, verification);

    return () => toLoadedState(loaded, verification);
  } catch (err) {
    return (previous) => ({
      ...previous,
      isLoading: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export function useTrackRecord() {
  const [state, setState] = useState<TrackRecordState>({
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
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function load() {
      const cached = cachedState();
      if (cached) {
        setState(cached);
        return;
      }

      const request = (inflight ??= loadTrackRecord().finally(() => {
        inflight = null;
      }));
      const update = await request;

      if (mountedRef.current) {
        setState(update);
      }
    }

    load();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return state;
}
