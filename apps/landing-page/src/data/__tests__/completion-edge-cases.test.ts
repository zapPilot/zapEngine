import { afterEach, describe, expect, it, vi } from 'vitest';

import { coverageDays, getDistributionSnapshot } from '@/data/distribution';

afterEach(() => {
  vi.doUnmock('../strategy-snapshot.json');
  vi.resetModules();
});

describe('landing data completion edges', () => {
  it('fails loudly when the configured strategy is absent from its snapshot', async () => {
    vi.doMock('../strategy-snapshot.json', () => ({
      default: {
        reference_date: '2026-09-18',
        window_days: 30,
        window_start: '2026-08-20',
        window_end: '2026-09-18',
        default_strategy_id: 'missing-strategy',
        strategies: {},
      },
    }));
    const { getBacktestSnapshot } = await import('../snapshot');

    expect(() => getBacktestSnapshot()).toThrow(
      'Missing strategy snapshot: missing-strategy',
    );
  });

  it('rejects an invalid coverage start independently of its end', () => {
    const snapshot = getDistributionSnapshot();
    expect(
      coverageDays({
        ...snapshot,
        coverage: {
          ...snapshot.coverage,
          firstEpisodeAt: 'not-a-date',
          lastEpisodeAt: '2026-09-18T00:00:00.000Z',
        },
      }),
    ).toBeNull();
  });

  it('rejects an invalid coverage end independently of its start', () => {
    const snapshot = getDistributionSnapshot();
    expect(
      coverageDays({
        ...snapshot,
        coverage: {
          ...snapshot.coverage,
          firstEpisodeAt: '2026-09-18T00:00:00.000Z',
          lastEpisodeAt: 'not-a-date',
        },
      }),
    ).toBeNull();
  });

  it('reports a same-day corpus as one day rather than zero', () => {
    const snapshot = getDistributionSnapshot();
    expect(
      coverageDays({
        ...snapshot,
        coverage: {
          ...snapshot.coverage,
          firstEpisodeAt: '2026-09-18T01:00:00.000Z',
          lastEpisodeAt: '2026-09-18T01:00:00.000Z',
        },
      }),
    ).toBe(1);
  });
});
