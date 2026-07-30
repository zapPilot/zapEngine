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
import { DEFAULT_HISTORY_LIMIT } from '@/config/track-record';

export interface TrackRecordState {
  meta: TrackRecordMeta | null;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
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
} = {
  meta: null,
  snapshots: null,
  snapshotEntries: null,
  summary: null,
  latestSnapshot: null,
};

interface LoadedTrackRecord {
  meta: TrackRecordMeta;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
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

export function useTrackRecord() {
  const [state, setState] = useState<TrackRecordState>({
    meta: null,
    snapshotEntries: [],
    snapshots: [],
    latestSnapshot: null,
    summary: computePerformanceSummary([]),
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
      const cache = moduleCache;

      if (
        cache.meta &&
        cache.snapshotEntries &&
        cache.snapshots &&
        cache.summary
      ) {
        const loaded: LoadedTrackRecord = {
          meta: cache.meta,
          snapshotEntries: cache.snapshotEntries,
          snapshots: cache.snapshots,
          latestSnapshot: cache.latestSnapshot,
          summary: cache.summary,
        };
        const verification = await buildVerification(loaded);

        if (mountedRef.current) {
          setState(toLoadedState(loaded, verification));
        }
        return;
      }

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
            const loaded: LoadedTrackRecord = {
              meta: mockMeta,
              snapshotEntries,
              snapshots,
              latestSnapshot,
              summary,
            };
            const verification = await buildVerification(loaded);

            cache.meta = mockMeta;
            cache.snapshotEntries = snapshotEntries;
            cache.snapshots = snapshots;
            cache.summary = summary;
            cache.latestSnapshot = latestSnapshot;

            if (mountedRef.current) {
              setState(toLoadedState(loaded, verification));
            }
            return;
          }

          if (mountedRef.current) {
            setState((prev) => ({
              ...prev,
              meta,
              isLoading: false,
              error: null,
            }));
          }
          cache.meta = meta;
          return;
        }

        const latestSnapshot = await fetchLatestSnapshot(meta);
        const snapshotEntries = await fetchSnapshotHistoryEntries(
          meta.latestSnapshotCid,
          DEFAULT_HISTORY_LIMIT,
        );
        const snapshots = snapshotEntries.map((entry) => entry.snapshot);
        const summary = computePerformanceSummary(snapshots);
        const loaded: LoadedTrackRecord = {
          meta,
          snapshotEntries,
          snapshots,
          latestSnapshot,
          summary,
        };
        const verification = await buildVerification(loaded);

        cache.meta = meta;
        cache.snapshotEntries = snapshotEntries;
        cache.snapshots = snapshots;
        cache.summary = summary;
        cache.latestSnapshot = latestSnapshot;

        if (mountedRef.current) {
          setState(toLoadedState(loaded, verification));
        }
      } catch (err) {
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }
    }

    load();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return state;
}
