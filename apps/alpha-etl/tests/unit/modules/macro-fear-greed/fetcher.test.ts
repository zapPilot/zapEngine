import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MacroFearGreedFetcher } from '../../../../src/modules/macro-fear-greed/fetcher.js';
import type { CnnFearGreedPayload } from '../../../../src/modules/macro-fear-greed/schema.js';
import { APIError } from '../../../../src/utils/errors.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

type FetcherWithRetry = {
  fetchWithRetry: (
    url: string,
    options?: unknown,
    maxRetries?: number,
    baseDelayMs?: number,
  ) => Promise<unknown>;
};

describe('MacroFearGreedFetcher', () => {
  let fetcher: MacroFearGreedFetcher;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00.000Z'));
    fetcher = new MacroFearGreedFetcher({ apiUrl: 'https://unit.test' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches and parses the current CNN payload', async () => {
    const payload: CnnFearGreedPayload = {
      fear_and_greed: {
        score: 64,
        rating: 'Greed',
        timestamp: 1777420800000,
      },
    };
    const fetchSpy = vi
      .spyOn(fetcher as unknown as FetcherWithRetry, 'fetchWithRetry')
      .mockResolvedValue(payload);

    const result = await fetcher.fetchCurrent();

    expect(result).toMatchObject({
      score: 64,
      label: 'greed',
      updatedAt: '2026-04-29T00:00:00.000Z',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://unit.test/index/fearandgreed/graphdata',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
      3,
      1000,
    );
  });

  it('fetches historical data with an encoded start date suffix', async () => {
    const payload: CnnFearGreedPayload = {
      fear_and_greed_historical: {
        data: [{ x: 1777420800000, y: 40, rating: 'Fear' }],
      },
    };
    const fetchSpy = vi
      .spyOn(fetcher as unknown as FetcherWithRetry, 'fetchWithRetry')
      .mockResolvedValue(payload);

    const result = await fetcher.fetchHistory('2026/04/29');

    expect(result).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://unit.test/index/fearandgreed/graphdata/2026%2F04%2F29',
      expect.any(Object),
      3,
      1000,
    );
  });

  it('wraps API errors with macro Fear & Greed context', async () => {
    vi.spyOn(
      fetcher as unknown as FetcherWithRetry,
      'fetchWithRetry',
    ).mockRejectedValue(
      new APIError('429 Too Many Requests', 429, 'https://unit.test'),
    );

    await expect(fetcher.fetchRawResponse()).rejects.toThrow(
      'CNN macro Fear & Greed API error: 429 Too Many Requests',
    );
  });

  it('rethrows non-API errors unchanged', async () => {
    const error = new Error('network down');
    vi.spyOn(
      fetcher as unknown as FetcherWithRetry,
      'fetchWithRetry',
    ).mockRejectedValue(error);

    await expect(fetcher.fetchRawResponse()).rejects.toBe(error);
  });

  it('reports healthy when current data is fresh', async () => {
    vi.spyOn(fetcher, 'fetchCurrent').mockResolvedValue({
      score: 60,
      label: 'greed',
      source: 'cnn_fear_greed_unofficial',
      updatedAt: '2026-04-30T00:00:00.000Z',
      rawRating: 'Greed',
      rawData: {},
    });

    const result = await fetcher.healthCheck();

    expect(result).toEqual({
      status: 'healthy',
      details: 'CNN macro Fear & Greed: 60 (greed)',
    });
  });

  it('reports unhealthy when current data is stale', async () => {
    vi.spyOn(fetcher, 'fetchCurrent').mockResolvedValue({
      score: 20,
      label: 'extreme_fear',
      source: 'cnn_fear_greed_unofficial',
      updatedAt: '2026-04-26T00:00:00.000Z',
      rawRating: 'Extreme Fear',
      rawData: {},
    });

    const result = await fetcher.healthCheck();

    expect(result.status).toBe('unhealthy');
    expect(result.details).toContain('stale');
  });
});
