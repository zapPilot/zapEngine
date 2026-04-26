vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => ({
  getDbPool: vi.fn().mockReturnValue({
    query: vi.fn(),
  }),
  getTableName: vi
    .fn()
    .mockImplementation((table: string) => `alpha_raw.${table.toLowerCase()}`),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';

describe('stock-price/processor', () => {
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
  });

  it('should create processor with default pool', async () => {
    const { StockPriceETLProcessor } =
      await import('../../../../src/modules/stock-price/processor.js');
    const processor = new StockPriceETLProcessor();
    expect(processor).toBeDefined();
  });

  it('should create processor with custom pool', async () => {
    const { StockPriceETLProcessor } =
      await import('../../../../src/modules/stock-price/processor.js');
    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    expect(processor).toBeDefined();
  });

  describe('getSourceType', () => {
    it('should return stock-price', async () => {
      const { StockPriceETLProcessor } =
        await import('../../../../src/modules/stock-price/processor.js');
      const processor = new StockPriceETLProcessor();

      const sourceType = processor.getSourceType();

      expect(sourceType).toBe('stock-price');
    });
  });

  describe('getStats', () => {
    it('should return initial stats', async () => {
      const { StockPriceETLProcessor } =
        await import('../../../../src/modules/stock-price/processor.js');
      const processor = new StockPriceETLProcessor();

      const stats = processor.getStats();

      expect(stats.totalProcessed).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.lastProcessedAt).toBeNull();
    });
  });

  describe('updateDmaForSymbol', () => {
    it('should return records when no prices', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const { StockPriceETLProcessor } =
        await import('../../../../src/modules/stock-price/processor.js');
      const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

      const result = await processor.updateDmaForSymbol('SPY', 'test-job');

      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when no data', async () => {
      const { StockPriceETLProcessor } =
        await import('../../../../src/modules/stock-price/processor.js');
      const processor = new StockPriceETLProcessor();

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
    });
  });
});
