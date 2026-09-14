import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadWithCurve(series: unknown[]) {
  vi.resetModules();
  vi.doMock('@/data/equity-curve.json', () => ({
    default: { series },
  }));
  return import('../mock-track-record');
}

afterEach(() => {
  vi.doUnmock('@/data/equity-curve.json');
  vi.resetModules();
});

describe('mock track-record artifact fallbacks', () => {
  it('builds an empty demo when the strategy series is absent', async () => {
    const data = await loadWithCurve([]);
    expect(data.mockSnapshotEntries).toEqual([]);
    expect(data.MOCK_LATEST_CID).toBe('');
    expect(data.mockMeta.updatedAt).toBe('');
  });

  it('uses the strategy value when the DCA series has no matching point', async () => {
    const data = await loadWithCurve([
      {
        id: 'strategy',
        values: [{ date: '2026-01-01', value: 100 }],
      },
      { id: 'dca', values: [] },
    ]);
    expect(data.mockSnapshotEntries).toHaveLength(1);
    expect(
      data.mockSnapshotEntries[0]?.snapshot.benchmarks[0]?.cumulativeReturn,
    ).toBe('0.00%');
  });
});
