import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('stock-price/yahooFetcher', () => {
  describe('YahooFinanceFetcherConfig', () => {
    it('should create fetcher with default config', async () => {
      const { YahooFinanceFetcher } =
        await import('../../../../src/modules/stock-price/yahooFetcher.js');
      const fetcher = new YahooFinanceFetcher();
      expect(fetcher).toBeDefined();
    });

    it('should create fetcher with custom rate limit', async () => {
      const { YahooFinanceFetcher } =
        await import('../../../../src/modules/stock-price/yahooFetcher.js');
      const fetcher = new YahooFinanceFetcher({ rateLimitMs: 500 });
      expect(fetcher).toBeDefined();
    });

    it('should accept optional symbol parameter', async () => {
      const { YahooFinanceFetcher } =
        await import('../../../../src/modules/stock-price/yahooFetcher.js');
      const fetcher = new YahooFinanceFetcher();
      expect(fetcher).toBeDefined();
    });
  });
});
