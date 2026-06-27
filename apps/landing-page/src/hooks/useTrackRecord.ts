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
  fetchSnapshotHistory,
  computePerformanceSummary,
  verifyCidChain,
  verifySignature,
} from '@/data/track-record-accessor';

export interface TrackRecordState {
  meta: TrackRecordMeta | null;
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
  };
  isLoading: boolean;
  error: string | null;
}

const MAX_SNAPSHOTS = 90;

const moduleCache: {
  meta: TrackRecordMeta | null;
  snapshots: DailySnapshot[] | null;
  summary: PerformanceSummary | null;
  latestSnapshot: DailySnapshot | null;
  rebalanceLogs: Map<string, RebalanceLog>;
} = {
  meta: null,
  snapshots: null,
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
    },
    isLoading: true,
    error: null,
  });

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function load() {
      const cache = loadCache();

      if (cache.meta && cache.snapshots && cache.summary) {
        const chainResult = verifyCidChain(cache.snapshots);
        const sigValid = cache.latestSnapshot
          ? verifySignature(
              cache.latestSnapshot,
              cache.meta.officialSigner ?? '',
            )
          : true;

        if (mountedRef.current) {
          setState({
            meta: cache.meta,
            snapshots: cache.snapshots,
            latestSnapshot: cache.latestSnapshot,
            summary: cache.summary,
            positions: cache.latestSnapshot?.positions ?? [],
            rebalanceLogs: [],
            verification: {
              chainValid: chainResult.valid,
              chainBrokenAt: chainResult.brokenAt,
              totalSnapshots: chainResult.totalSnapshots,
              signatureValid: sigValid,
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
        const snapshots = await fetchSnapshotHistory(
          meta.latestSnapshotCid,
          MAX_SNAPSHOTS,
        );
        const summary = computePerformanceSummary(snapshots);

        const chainResult = verifyCidChain(snapshots);
        const sigValid = verifySignature(
          latestSnapshot,
          meta.officialSigner ?? '',
        );

        cache.meta = meta;
        cache.snapshots = snapshots;
        cache.summary = summary;
        cache.latestSnapshot = latestSnapshot;

        if (mountedRef.current) {
          setState({
            meta,
            snapshots,
            latestSnapshot,
            summary,
            positions: latestSnapshot.positions,
            rebalanceLogs: [],
            verification: {
              chainValid: chainResult.valid,
              chainBrokenAt: chainResult.brokenAt,
              totalSnapshots: chainResult.totalSnapshots,
              signatureValid: sigValid,
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
