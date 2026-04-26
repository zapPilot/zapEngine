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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

describe('stock-price/dmaService', () => {
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
  });

  it('should create service with default pool', async () => {
    const { StockPriceDmaService } =
      await import('../../../../src/modules/stock-price/dmaService.js');
    const service = new StockPriceDmaService();
    expect(service).toBeDefined();
  });

  it('should create service with custom pool', async () => {
    const { StockPriceDmaService } =
      await import('../../../../src/modules/stock-price/dmaService.js');
    const service = new StockPriceDmaService(mockPool as unknown as Pool);
    expect(service).toBeDefined();
  });

  describe('updateDmaForSymbol', () => {
    it('should return zero records when no price data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.updateDmaForSymbol('SPY', 'test-job');

      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('getLatestDmaSnapshot', () => {
    it('should return null when no DMA data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).toBeNull();
    });

    it('should return latest DMA snapshot', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            snapshot_date: '2024-12-15',
            price_usd: '4510.75',
            dma_200: '4450.00',
            is_above_dma: true,
          },
        ],
      });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).not.toBeNull();
      expect(result!.date).toBe('2024-12-15');
      expect(result!.price).toBe(4510.75);
      expect(result!.dma200).toBe(4450);
      expect(result!.isAboveDma).toBe(true);
    });

    it('should handle null DMA values', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            snapshot_date: '2024-12-15',
            price_usd: '4510.75',
            dma_200: null,
            is_above_dma: null,
          },
        ],
      });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).not.toBeNull();
      expect(result!.dma200).toBeNull();
      expect(result!.isAboveDma).toBeNull();
    });
  });
});
