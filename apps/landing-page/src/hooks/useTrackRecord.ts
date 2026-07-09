'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  DailySnapshot,
  RebalanceLog,
  TrackRecordMeta,
} from '@zapengine/types/strategy';
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

export interface TrackRecordState {
  meta: TrackRecordMeta | null;
  snapshotEntries: SnapshotHistoryEntry[];
  snapshots: DailySnapshot[];
  latestSnapshot: DailySnapshot | null;
  summary: PerformanceSummary;
  positions: DailySnapshot['positions'];
  rebalanceLogs: RebalanceLog[];
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

const MAX_SNAPSHOTS = 90;

const moduleCache: {
  meta: TrackRecordMeta | null;
  snapshots: DailySnapshot[] | null;
  snapshotEntries: SnapshotHistoryEntry[] | null;
  summary: PerformanceSummary | null;
  latestSnapshot: DailySnapshot | null;
  rebalanceLogs: Map<string, RebalanceLog>;
} = {
  meta: null,
  snapshots: null,
  snapshotEntries: null,
  summary: null,
  latestSnapshot: null,
  rebalanceLogs: new Map(),
};

function loadCache() {
  return moduleCache;
}

export function useTrackRecord() {
  const [state, setState] = useState<TrackRecordState>({
    meta: null,
    snapshotEntries: [],
    snapshots: [],
    latestSnapshot: null,
    summary: computePerformanceSummary([]),
    positions: [],
    rebalanceLogs: [],
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
      const cache = loadCache();

      if (
        cache.meta &&
        cache.snapshotEntries &&
        cache.snapshots &&
        cache.summary
      ) {
        const chainResult = verifyCidChain(cache.snapshotEntries);
        const performanceResult = verifyPerformanceMetrics(cache.snapshots);
        const sigValid = cache.latestSnapshot
          ? await verifySignature(
              cache.latestSnapshot,
              cache.meta.officialSigner ?? '',
            )
          : null;

        if (mountedRef.current) {
          setState({
            meta: cache.meta,
            snapshotEntries: cache.snapshotEntries,
            snapshots: cache.snapshots,
            latestSnapshot: cache.latestSnapshot,
            summary: cache.summary,
            positions: cache.latestSnapshot?.positions ?? [],
            rebalanceLogs: [],
            verification: {
              chainValid: chainResult.valid,
              chainBrokenAt: chainResult.brokenAt,
              totalSnapshots: chainResult.totalSnapshots,
              signatureValid: sigValid?.valid ?? true,
              signature: sigValid,
              performanceValid: performanceResult.valid,
              performanceErrors: performanceResult.errors,
            },
            isLoading: false,
            error: null,
          });
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
            const chainResult = verifyCidChain(snapshotEntries);
            const performanceResult = verifyPerformanceMetrics(snapshots);
            const sigValid = latestSnapshot
              ? await verifySignature(latestSnapshot, '')
              : null;

            cache.meta = mockMeta;
            cache.snapshotEntries = snapshotEntries;
            cache.snapshots = snapshots;
            cache.summary = summary;
            cache.latestSnapshot = latestSnapshot;

            if (mountedRef.current) {
              setState({
                meta: mockMeta,
                snapshotEntries,
                snapshots,
                latestSnapshot,
                summary,
                positions: latestSnapshot?.positions ?? [],
                rebalanceLogs: [],
                verification: {
                  chainValid: chainResult.valid,
                  chainBrokenAt: chainResult.brokenAt,
                  totalSnapshots: chainResult.totalSnapshots,
                  signatureValid: sigValid?.valid ?? true,
                  signature: sigValid,
                  performanceValid: performanceResult.valid,
                  performanceErrors: performanceResult.errors,
                },
                isLoading: false,
                error: null,
              });
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
          MAX_SNAPSHOTS,
        );
        const snapshots = snapshotEntries.map((entry) => entry.snapshot);
        const summary = computePerformanceSummary(snapshots);

        const chainResult = verifyCidChain(snapshotEntries);
        const performanceResult = verifyPerformanceMetrics(snapshots);
        const sigValid = await verifySignature(
          latestSnapshot,
          meta.officialSigner ?? '',
        );

        cache.meta = meta;
        cache.snapshotEntries = snapshotEntries;
        cache.snapshots = snapshots;
        cache.summary = summary;
        cache.latestSnapshot = latestSnapshot;

        if (mountedRef.current) {
          setState({
            meta,
            snapshotEntries,
            snapshots,
            latestSnapshot,
            summary,
            positions: latestSnapshot.positions,
            rebalanceLogs: [],
            verification: {
              chainValid: chainResult.valid,
              chainBrokenAt: chainResult.brokenAt,
              totalSnapshots: chainResult.totalSnapshots,
              signatureValid: sigValid.valid,
              signature: sigValid,
              performanceValid: performanceResult.valid,
              performanceErrors: performanceResult.errors,
            },
            isLoading: false,
            error: null,
          });
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
