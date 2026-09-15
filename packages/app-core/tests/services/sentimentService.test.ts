import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  validate: vi.fn((value: unknown) => value),
  getQuote: vi.fn(() => ({
    quote: 'Stay rational.',
    author: 'Zap',
    sentiment: 'Fear',
  })),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: {
    analyticsEngine: {
      get: mocks.get,
    },
  },
}));

vi.mock('@core/lib/http/createServiceCaller', () => ({
  createApiServiceCaller:
    () =>
    async <T>(operation: () => Promise<T>): Promise<T> =>
      operation(),
}));

vi.mock('@core/schemas/api/sentimentSchemas', () => ({
  validateSentimentApiResponse: mocks.validate,
}));

vi.mock('@core/config/sentimentQuotes', () => ({
  getQuoteForSentiment: mocks.getQuote,
}));

import { fetchMarketSentiment } from '@core/services/sentimentService';

describe('sentimentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({
      value: 22,
      status: 'Extreme Fear',
      timestamp: '2026-09-15T00:00:00Z',
    });
  });

  it('fetches, validates, and enriches market sentiment with a quote', async () => {
    await expect(fetchMarketSentiment()).resolves.toEqual({
      value: 22,
      status: 'Extreme Fear',
      timestamp: '2026-09-15T00:00:00Z',
      quote: {
        quote: 'Stay rational.',
        author: 'Zap',
        sentiment: 'Fear',
      },
    });

    expect(mocks.get).toHaveBeenCalledWith('/api/v2/market/sentiment');
    expect(mocks.validate).toHaveBeenCalledWith({
      value: 22,
      status: 'Extreme Fear',
      timestamp: '2026-09-15T00:00:00Z',
    });
    expect(mocks.getQuote).toHaveBeenCalledWith(22);
  });
});
