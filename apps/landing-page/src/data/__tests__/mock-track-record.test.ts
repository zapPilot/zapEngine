import { describe, expect, it } from 'vitest';
import {
  MOCK_LATEST_CID,
  hasLiveTrackRecordData,
  isDemoTrackRecordMeta,
  positionsForNav,
} from '@/data/mock-track-record';
import type { TrackRecordMeta } from '@zapengine/types/strategy';

function meta(latestSnapshotCid: string): TrackRecordMeta {
  return {
    schemaVersion: '1',
    strategyId: 'dma_fgi_portfolio_rules',
    strategyVersion: 'v1',
    latestSnapshotCid,
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

describe('positionsForNav', () => {
  it('filters a position below 0.5 percentage points', () => {
    const positions = positionsForNav(10_000, {
      btc: 49.51,
      eth: 0.49,
      spy: 0,
      stable: 50,
    });

    expect(positions.map((position) => position.asset)).toEqual([
      'BTC',
      'USDC',
    ]);
  });

  it('keeps a position exactly at 0.5 percentage points', () => {
    const positions = positionsForNav(10_000, {
      btc: 49.5,
      eth: 0.5,
      spy: 0,
      stable: 50,
    });

    expect(positions.map((position) => position.asset)).toEqual([
      'BTC',
      'ETH',
      'USDC',
    ]);
    expect(positions.find((position) => position.asset === 'ETH')?.weight).toBe(
      '0.50%',
    );
  });
});

describe('demo sentinel', () => {
  it('recognises the demo dataset by its sentinel CID', () => {
    expect(isDemoTrackRecordMeta(meta(MOCK_LATEST_CID))).toBe(true);
    expect(hasLiveTrackRecordData(meta(MOCK_LATEST_CID))).toBe(false);
  });

  it('treats a published CID that is not the sentinel as live', () => {
    expect(isDemoTrackRecordMeta(meta('bafyreal'))).toBe(false);
    expect(hasLiveTrackRecordData(meta('bafyreal'))).toBe(true);
  });

  it('treats an empty CID as pending rather than live or demo', () => {
    expect(isDemoTrackRecordMeta(meta(''))).toBe(false);
    expect(hasLiveTrackRecordData(meta(''))).toBe(false);
  });

  it('treats absent meta as neither', () => {
    expect(isDemoTrackRecordMeta(null)).toBe(false);
    expect(hasLiveTrackRecordData(null)).toBe(false);
  });
});
