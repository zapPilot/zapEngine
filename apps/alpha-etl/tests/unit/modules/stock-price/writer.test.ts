vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => ({
  getTableName: vi
    .fn()
    .mockImplementation((table: string) => `alpha_raw.${table.toLowerCase()}`),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('stock-price/writer', () => {
  let writer: {
    insertSnapshot: (data: {
      date: string;
      priceUsd: number;
      symbol: string;
      source: string;
      timestamp: Date;
    }) => Promise<void>;
    insertBatch: (
      snapshots: Array<{
        priceUsd: number;
        timestamp: Date;
        source: string;
        symbol: string;
      }>,
    ) => Promise<number>;
    getLatestSnapshot: (
      symbol?: string,
    ) => Promise<{ date: string; price: number; symbol: string } | null>;
    getSnapshotCount: (symbol?: string) => Promise<number>;
    getExistingDatesInRange: (
      startDate: Date,
      endDate: Date,
      symbol?: string,
      source?: string,
    ) => Promise<string[]>;
  };
  let mockClient: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { query: vi.fn() };
  });

  it('should create writer', async () => {
    const { StockPriceWriter } =
      await import('../../../../src/modules/stock-price/writer.js');
    writer = new StockPriceWriter();
    expect(writer).toBeDefined();
  });

  describe('insertSnapshot', () => {
    it('should insert snapshot successfully', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, snapshot_date: '2024-12-15' }],
        rowCount: 1,
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      await writer.insertSnapshot({
        date: '2024-12-15',
        priceUsd: 4510.75,
        symbol: 'SPY',
        source: 'yahoo-finance',
        timestamp: new Date('2024-12-15'),
      });

      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should throw when insert fails', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection refused'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      await expect(
        writer.insertSnapshot({
          date: '2024-12-15',
          priceUsd: 4510.75,
          symbol: 'SPY',
          source: 'yahoo-finance',
          timestamp: new Date('2024-12-15'),
        }),
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('insertBatch', () => {
    it('should return 0 for empty array', async () => {
      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      const result = await writer.insertBatch([]);

      expect(result).toBe(0);
    });

    it('should insert batch successfully', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: 2,
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const snapshots = [
        {
          priceUsd: 4510.75,
          timestamp: new Date('2024-12-15'),
          source: 'yahoo-finance',
          symbol: 'SPY',
        },
        {
          priceUsd: 4490.5,
          timestamp: new Date('2024-12-14'),
          source: 'yahoo-finance',
          symbol: 'SPY',
        },
      ];

      const result = await writer.insertBatch(snapshots);

      expect(result).toBe(2);
    });

    it('should fall back to rows length when rowCount is absent', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.insertBatch([
        {
          priceUsd: 4510.75,
          timestamp: new Date('2024-12-15'),
          source: 'yahoo-finance',
          symbol: 'SPY',
        },
        {
          priceUsd: 4490.5,
          timestamp: new Date('2024-12-14'),
          source: 'yahoo-finance',
          symbol: 'SPY',
        },
      ]);

      expect(result).toBe(3);
    });

    it('should throw on batch insert failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Batch failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      await expect(
        writer.insertBatch([
          {
            priceUsd: 4510.75,
            timestamp: new Date('2024-12-15'),
            source: 'yahoo-finance',
            symbol: 'SPY',
          },
        ]),
      ).rejects.toThrow('Batch failed');
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return null when no data', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getLatestSnapshot('SPY');

      expect(result).toBeNull();
    });

    it('should return latest snapshot', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          {
            snapshot_date: '2024-12-15',
            price_usd: '4510.75',
            symbol: 'SPY',
          },
        ],
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getLatestSnapshot('SPY');

      expect(result).not.toBeNull();
      expect(result!.date).toBe('2024-12-15');
      expect(result!.price).toBe(4510.75);
      expect(mockClient.query.mock.calls[0]?.[0]).toContain(
        "source = 'yahoo-finance'",
      );
    });

    it('should return null when the first row is undefined', async () => {
      mockClient.query.mockResolvedValue({
        rows: [undefined],
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getLatestSnapshot('SPY');

      expect(result).toBeNull();
    });

    it('should throw on latest snapshot query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Latest failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      await expect(writer.getLatestSnapshot('SPY')).rejects.toThrow(
        'Latest failed',
      );
    });
  });

  describe('getSnapshotCount', () => {
    it('should return 0 when no data', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ count: '0' }] });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(0);
    });

    it('should return count', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ count: '100' }] });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(100);
      expect(mockClient.query.mock.calls[0]?.[0]).toContain(
        "source = 'yahoo-finance'",
      );
    });

    it('should return 0 when count row is absent', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(0);
    });

    it('should return 0 on count query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Count failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(0);
    });
  });

  describe('getExistingDatesInRange', () => {
    it('should return existing snapshot dates in ascending order', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          { snapshot_date: '2024-12-14' },
          { snapshot_date: '2024-12-15' },
        ],
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getExistingDatesInRange(
        new Date('2024-12-01T00:00:00.000Z'),
        new Date('2024-12-31T00:00:00.000Z'),
        'SPY',
      );

      expect(result).toEqual(['2024-12-14', '2024-12-15']);
      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
        'yahoo-finance',
        'SPY',
        '2024-12-01',
        '2024-12-31',
      ]);
    });

    it('should support an explicit source override', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ snapshot_date: '2024-12-15' }],
      });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      await writer.getExistingDatesInRange(
        new Date('2024-12-01T00:00:00.000Z'),
        new Date('2024-12-31T00:00:00.000Z'),
        'SPY',
        'custom-source',
      );

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
        'custom-source',
        'SPY',
        '2024-12-01',
        '2024-12-31',
      ]);
    });

    it('should return an empty array when range lookup fails', async () => {
      mockClient.query.mockRejectedValue(new Error('Range failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(writer as any, 'withDatabaseClient').mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockClient),
      );

      const result = await writer.getExistingDatesInRange(
        new Date('2024-12-01T00:00:00.000Z'),
        new Date('2024-12-31T00:00:00.000Z'),
      );

      expect(result).toEqual([]);
    });
  });
});
