vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => {
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  return {
    getDbPool: vi.fn().mockReturnValue({
      query: vi.fn(),
    }),
    getDbClient: vi.fn().mockImplementation(async () => {
      if (!mockClient) {
        mockClient = {
          query: vi.fn(),
          release: vi.fn(),
        };
      }
      return mockClient;
    }),
    getTableName: vi
      .fn()
      .mockImplementation(
        (table: string) => `alpha_raw.${table.toLowerCase()}`,
      ),
  };
});

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

describe('stock-price/dmaService', () => {
  let mockPool: {
    query: ReturnType<typeof vi.fn>;
  };
  let mockClient: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    mockPool = {
      query: vi.fn(),
    };
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
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

      // Mock the fetch prices query (uses pool)
      mockPool.query.mockResolvedValueOnce({ rows: priceRows });

      // Mock the writer batch queries (uses client via getDbClient)
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      const writeQuery = vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 500 })
        .mockResolvedValueOnce({ rowCount: 500 })
        .mockResolvedValueOnce({ rowCount: 1 });
      const release = vi.fn();
      mockGetDbClient.mockResolvedValue({ query: writeQuery, release });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.updateDmaForSymbol();

      expect(result).toEqual({ recordsInserted: 1001 });
      expect(writeQuery).toHaveBeenCalledTimes(3);
      expect(release).toHaveBeenCalledTimes(3);
      const firstBatch = writeQuery.mock.calls[0]![1] as unknown[];
      const finalBatch = writeQuery.mock.calls[2]![1] as unknown[];
      const row = (index: number) =>
        firstBatch.slice(index * 10, (index + 1) * 10);
      expect(row(198)).toEqual([
        'SPY',
        priceRows[198]!.snapshot_date,
        298,
        null,
        null,
        null,
        199,
        'yahoo-finance',
        '2026-05-01T12:00:00.000Z',
        '2026-05-01T12:00:00.000Z',
      ]);
      expect(row(199)).toEqual([
        'SPY',
        priceRows[199]!.snapshot_date,
        299,
        199.5,
        299 / 199.5,
        true,
        200,
        'yahoo-finance',
        '2026-05-01T12:00:00.000Z',
        '2026-05-01T12:00:00.000Z',
      ]);
      expect(row(200)[3]).toBe(200.5);
      expect(finalBatch).toEqual([
        'SPY',
        priceRows[1000]!.snapshot_date,
        1100,
        1000.5,
        1100 / 1000.5,
        true,
        200,
        'yahoo-finance',
        '2026-05-01T12:00:00.000Z',
        '2026-05-01T12:00:00.000Z',
      ]);
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
        'yahoo-finance',
        'SPY',
      ]);
    });

    it('propagates database errors from DMA writes', async () => {
      // Mock the fetch prices query (uses pool)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            symbol: 'SPY',
            snapshot_date: '2026-05-01',
            price_usd: '500',
          },
        ],
      });

      // Mock the writer to fail (uses client via getDbClient)
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      mockGetDbClient.mockResolvedValue({
        query: vi.fn().mockRejectedValue(new Error('dma write failed')),
        release: vi.fn(),
      });

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
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      mockGetDbClient.mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).toBeNull();
    });

    it('should return latest DMA snapshot', async () => {
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      mockGetDbClient.mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              snapshot_date: '2024-12-15',
              price_usd: '4510.75',
              dma_200: '4450.00',
              is_above_dma: true,
            },
          ],
        }),
        release: vi.fn(),
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
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      mockGetDbClient.mockResolvedValue({
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              snapshot_date: '2024-12-15',
              price_usd: '4510.75',
              dma_200: null,
              is_above_dma: null,
            },
          ],
        }),
        release: vi.fn(),
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
      const { getDbClient } =
        await import('../../../../src/config/database.js');
      const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;
      mockGetDbClient.mockResolvedValue({
        query: vi.fn().mockRejectedValue(new Error('read failed')),
        release: vi.fn(),
      });

      const { StockPriceDmaService } =
        await import('../../../../src/modules/stock-price/dmaService.js');
      const service = new StockPriceDmaService(mockPool as unknown as Pool);

      const result = await service.getLatestDmaSnapshot('SPY');

      expect(result).toBeNull();
    });
  });
});
