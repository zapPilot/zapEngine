import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetcher: {
    fetchCurrentPrice: vi.fn(),
    fetchHistoricalPrice: vi.fn(),
    formatDateForApi: vi.fn((d: Date) => d.toISOString().split('T')[0]),
    healthCheck: vi.fn(),
    getRequestStats: vi.fn(() => ({})),
  },
  writer: {
    insertSnapshot: vi.fn(),
    getExistingDatesInRange: vi.fn(),
    getLatestSnapshot: vi.fn(),
    getSnapshotCount: vi.fn(),
    insertBatch: vi.fn(),
  },
  dmaService: {
    updateDmaForToken: vi.fn(),
    updateEthBtcRatioDma: vi.fn(),
    getLatestDmaSnapshot: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({ logger: mocks.logger }));

vi.mock('../../../../src/modules/token-price/fetcher.js', () => ({
  CoinGeckoFetcher: class { constructor() { return mocks.fetcher; } },
}));

vi.mock('../../../../src/modules/token-price/writer.js', () => ({
  TokenPriceWriter: class { constructor() { return mocks.writer; } },
}));

vi.mock('../../../../src/modules/token-price/dmaService.js', () => ({
  TokenPriceDmaService: class { constructor() { return mocks.dmaService; } },
}));

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbPool: vi.fn(() => ({} as unknown)),
  };
});

import { TokenPriceETLProcessor } from '../../../../src/modules/token-price/processor.js';

describe('TokenPriceETLProcessor error paths', () => {
  let processor: TokenPriceETLProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new TokenPriceETLProcessor({} as unknown);
  });

  describe('processCurrentPrice', () => {
    it('should log and re-throw on fetch failure', async () => {
      mocks.fetcher.fetchCurrentPrice.mockRejectedValueOnce(new Error('API down'));

      await expect(processor.processCurrentPrice()).rejects.toThrow('API down');
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Token price ETL failed',
        expect.objectContaining({ error: 'API down' })
      );
    });
  });

  describe('processCurrentPrice non-Error', () => {
    it('logs undefined stack when a non-Error is thrown', async () => {
      // eslint-disable-next-line no-throw-literal
      mocks.fetcher.fetchCurrentPrice.mockRejectedValueOnce('string-error');

      await expect(processor.processCurrentPrice()).rejects.toBe('string-error');
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Token price ETL failed',
        expect.objectContaining({ stack: undefined })
      );
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy on exception', async () => {
      mocks.fetcher.healthCheck.mockRejectedValueOnce(new Error('health boom'));

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toBe('health boom');
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Health check failed',
        expect.objectContaining({ error: 'health boom' })
      );
    });
  });

  describe('getStats', () => {
    it('should show lastProcessedAt and successRate after a successful process', async () => {
      const job = {
        jobId: 'test-1',
        trigger: 'manual',
        sources: ['token-price'],
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      mocks.fetcher.fetchCurrentPrice.mockResolvedValueOnce({
        priceUsd: 100, marketCapUsd: 1000, volume24hUsd: 500,
        source: 'coingecko', tokenSymbol: 'BTC', tokenId: 'bitcoin',
        timestamp: new Date(),
      });
      mocks.writer.insertSnapshot.mockResolvedValueOnce(undefined);
      mocks.dmaService.updateDmaForToken.mockResolvedValueOnce({ recordsInserted: 1 });
      mocks.dmaService.updateEthBtcRatioDma.mockResolvedValueOnce({ recordsInserted: 1 });

      await processor.process(job as unknown);

      const stats = processor.getStats();
      expect(stats.lastProcessedAt).not.toBeNull();
      expect(stats.successRate).toContain('%');
      expect(stats.totalProcessed).toBe(1);
      expect(mocks.dmaService.updateEthBtcRatioDma).toHaveBeenCalledTimes(1);
    });

    it('should show N/A success rate when nothing processed', () => {
      const stats = processor.getStats();
      expect(stats.successRate).toBe('N/A');
      expect(stats.lastProcessedAt).toBeNull();
    });
  });

  describe('backfillHistory error paths', () => {
    it('should fall back to empty dates when gap detection fails', async () => {
      mocks.writer.getExistingDatesInRange.mockRejectedValueOnce(new Error('gap error'));
      mocks.fetcher.fetchHistoricalPrice.mockResolvedValue({
        priceUsd: 100, marketCapUsd: 1000, volume24hUsd: 500,
        source: 'coingecko', tokenSymbol: 'BTC', tokenId: 'bitcoin',
        timestamp: new Date(),
      });
      mocks.writer.insertBatch.mockResolvedValueOnce(1);

      const result = await processor.backfillHistory(1);

      expect(result.existing).toBe(0);
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Gap detection failed, falling back to full fetch',
        expect.objectContaining({ error: 'gap error' })
      );
    });

    it('should log and skip individual date fetch failures', async () => {
      mocks.writer.getExistingDatesInRange.mockResolvedValueOnce([]);
      mocks.fetcher.fetchHistoricalPrice.mockRejectedValueOnce(new Error('fetch fail'));
      mocks.writer.insertBatch.mockResolvedValueOnce(0);

      const result = await processor.backfillHistory(1);

      expect(result.fetched).toBe(0);
      expect(mocks.logger.error).toHaveBeenCalledWith(
        'Failed to fetch missing date',
        expect.objectContaining({ error: 'fetch fail' })
      );
    });
  });

  describe('ETH/BTC ratio refresh', () => {
    it('should refresh ETH/BTC ratio after BTC DMA updates', async () => {
      mocks.dmaService.updateDmaForToken.mockResolvedValueOnce({ recordsInserted: 1 });
      mocks.dmaService.updateEthBtcRatioDma.mockResolvedValueOnce({ recordsInserted: 1 });

      await processor.updateDmaForToken('BTC', 'bitcoin', 'job-btc');

      expect(mocks.dmaService.updateEthBtcRatioDma).toHaveBeenCalledWith('job-btc');
    });

    it('should skip ETH/BTC ratio refresh for unrelated tokens', async () => {
      mocks.dmaService.updateDmaForToken.mockResolvedValueOnce({ recordsInserted: 1 });

      await processor.updateDmaForToken('SOL', 'solana', 'job-sol');

      expect(mocks.dmaService.updateEthBtcRatioDma).not.toHaveBeenCalled();
    });
  });
});
