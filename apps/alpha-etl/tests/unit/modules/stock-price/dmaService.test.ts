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

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

describe('stock-price/dmaService', () => {
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    mockPool = {
      query: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

    it('computes DMA snapshots and writes them in database batches', async () => {
      const priceRows = Array.from({ length: 1001 }, (_, index) => ({
        symbol: 'SPY',
        snapshot_date: new Date(Date.UTC(2025, 0, index + 1))
          .toISOString()
          .slice(0, 10),
        price_usd: String(100 + index),
      }));
      mockPool.query
        .mockResolvedValueOnce({ rows: priceRows })
        .mockResolvedValueOnce({ rowCount: 1000 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.updateDmaForSymbol();

      expect(result).toEqual({ recordsInserted: 1001 });
      expect(mockPool.query).toHaveBeenNthCalledWith(1, expect.any(String), [
        'yahoo-finance',
        'SPY',
      ]);
      expect(mockPool.query).toHaveBeenCalledTimes(3);

      const firstWrite = mockPool.query.mock.calls[1]?.[0] as {
        text: string;
        values: unknown[];
      };
      expect(firstWrite.text).toContain(
        'INSERT INTO alpha_raw.stock_price_dma_snapshots',
      );
      expect(firstWrite.values).toHaveLength(10_000);
      expect(firstWrite.values.slice(0, 10)).toEqual([
        'SPY',
        '2025-01-01',
        100,
        null,
        null,
        null,
        1,
        'yahoo-finance',
        '2026-05-01T12:00:00.000Z',
        '2026-05-01T12:00:00.000Z',
      ]);

      const day200Offset = 199 * 10;
      expect(firstWrite.values[day200Offset + 3]).toBe(199.5);
      expect(firstWrite.values[day200Offset + 4]).toBeCloseTo(299 / 199.5);
      expect(firstWrite.values[day200Offset + 5]).toBe(true);
      expect(firstWrite.values[day200Offset + 6]).toBe(200);

      const secondWrite = mockPool.query.mock.calls[2]?.[0] as {
        values: unknown[];
      };
      expect(secondWrite.values).toHaveLength(10);
    });

    it('propagates database errors from DMA writes', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              symbol: 'SPY',
              snapshot_date: '2026-05-01',
              price_usd: '500',
            },
          ],
        })
        .mockRejectedValueOnce(new Error('dma write failed'));

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      await expect(service.updateDmaForSymbol('SPY', 'job-1')).rejects.toThrow(
        'dma write failed',
      );
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

    it('should return null when the latest DMA query fails', async () => {
      mockPool.query.mockRejectedValue(new Error('read failed'));

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).toBeNull();
    });
  });
});
