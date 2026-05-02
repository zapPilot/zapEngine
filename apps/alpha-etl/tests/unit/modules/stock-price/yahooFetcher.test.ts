import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuote, mockChart } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
  mockChart: vi.fn(),
}));

vi.mock('yahoo-finance2', () => ({
  default: vi.fn(function YahooFinance() {
    return {
      quote: mockQuote,
      chart: mockChart,
    };
  }),
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

import { YahooFinanceFetcher } from '../../../../src/modules/stock-price/yahooFetcher.js';

describe('stock-price/YahooFinanceFetcher', () => {
  beforeEach(() => {
    mockQuote.mockReset();
    mockChart.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the latest price with market time from Yahoo Finance', async () => {
    mockQuote.mockResolvedValue({
      regularMarketPrice: 512.34,
      regularMarketTime: 1777420800,
    });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    const result = await fetcher.fetchLatestPrice('SPY');

    expect(result).toEqual({
      date: '2026-04-29',
      priceUsd: 512.34,
      symbol: 'SPY',
      source: 'yahoo-finance',
      timestamp: expect.any(Date),
    });
    expect(mockQuote).toHaveBeenCalledWith('SPY');
  });

  it('uses the current clock when market time is absent', async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 510 });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    const result = await fetcher.fetchLatestPrice();

    expect(result.symbol).toBe('SPY');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws when the quote has no numeric price', async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: undefined });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    await expect(fetcher.fetchLatestPrice('QQQ')).rejects.toThrow(
      'No quote data for QQQ',
    );
  });

  it('fetches full history and prefers adjusted close over close', async () => {
    mockChart.mockResolvedValue({
      quotes: [
        {
          date: new Date('2026-04-28T00:00:00.000Z'),
          open: 500,
          high: 506,
          low: 499,
          close: 505,
          volume: 1000,
          adjclose: 504.5,
        },
        {
          date: new Date('2026-04-29T00:00:00.000Z'),
          open: 506,
          high: 508,
          low: 503,
          close: 507,
          volume: 1100,
          adjclose: null,
        },
        {
          date: new Date('2026-04-30T00:00:00.000Z'),
          open: 507,
          high: 509,
          low: 505,
          close: null,
          volume: 900,
          adjclose: null,
        },
      ],
    });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    const result = await fetcher.fetchFullHistory(
      'SPY',
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(result).toEqual([
      {
        priceUsd: 504.5,
        timestamp: new Date('2026-04-28T00:00:00.000Z'),
        source: 'yahoo-finance',
        symbol: 'SPY',
      },
      {
        priceUsd: 507,
        timestamp: new Date('2026-04-29T00:00:00.000Z'),
        source: 'yahoo-finance',
        symbol: 'SPY',
      },
    ]);
    expect(mockChart).toHaveBeenCalledWith(
      'SPY',
      expect.objectContaining({
        period1: new Date('2026-04-01T00:00:00.000Z'),
        period2: expect.any(Date),
        interval: '1d',
      }),
    );
  });

  it('throws when full history response does not match the schema', async () => {
    mockChart.mockResolvedValue({
      quotes: [{ date: 'not-a-date', close: 'not-a-number' }],
    });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    await expect(fetcher.fetchFullHistory('SPY')).rejects.toThrow(
      'Invalid Yahoo Finance response schema',
    );
  });

  it('reports Yahoo Finance as healthy when quote succeeds', async () => {
    mockQuote.mockResolvedValue({ regularMarketPrice: 512.34 });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    const result = await fetcher.healthCheck('SPY');

    expect(result).toEqual({
      status: 'healthy',
      details: 'Yahoo Finance API accessible',
    });
  });

  it('reports Yahoo Finance as unhealthy when quote fails', async () => {
    mockQuote.mockRejectedValue(new Error('rate limited'));
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 0 });

    const result = await fetcher.healthCheck('SPY');

    expect(result).toEqual({
      status: 'unhealthy',
      details: 'rate limited',
    });
  });

  it('waits for the configured rate limit before calling Yahoo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    mockQuote.mockResolvedValue({ regularMarketPrice: 512.34 });
    const fetcher = new YahooFinanceFetcher({ rateLimitMs: 250 });

    const promise = fetcher.fetchLatestPrice('SPY');

    expect(mockQuote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toMatchObject({ priceUsd: 512.34 });
    expect(mockQuote).toHaveBeenCalledWith('SPY');
  });
});
