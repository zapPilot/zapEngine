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
import type { PoolClient } from 'pg';

/**
 * The writer only reaches Postgres through `withDatabaseClient`, so the test
 * double needs nothing but `query` — narrowed from `PoolClient` to the one
 * method the writer calls, and widened with the vitest mock surface the tests
 * program (`mockResolvedValue`, `mock.calls`, …). Casting the narrow double
 * up at the seam instead of threading `any` keeps this file free of
 * `no-explicit-any` escapes.
 */
type MockDatabaseClient = Pick<PoolClient, 'query'> & {
  query: ReturnType<typeof vi.fn>;
};

/** Structural mirror of `BaseDatabaseClient.withDatabaseClient` (protected in prod). */
interface DatabaseClientSeam {
  withDatabaseClient<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T>;
}

function spyOnWithDatabaseClient(
  writer: unknown,
  mockClient: MockDatabaseClient,
) {
  const seam = writer as unknown as DatabaseClientSeam;
  return vi
    .spyOn(seam, 'withDatabaseClient')
    .mockImplementation(<T>(operation: (client: PoolClient) => Promise<T>) =>
      operation(mockClient as unknown as PoolClient),
    );
}

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
  let mockClient: MockDatabaseClient;

  beforeEach(() => {
    // A bare `vi.fn()` cannot satisfy `PoolClient.query`'s generic overloads
    // directly; the seam cast in `spyOnWithDatabaseClient` upholds the
    // `PoolClient` side, so only this creation site needs the assertion.
    mockClient = { query: vi.fn() } as MockDatabaseClient;
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
      writer = new Writer();

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

      const result = await writer.getLatestSnapshot('SPY');

      expect(result).toBeNull();
    });

    it('should throw on latest snapshot query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Latest failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(0);
    });

    it('should return count', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ count: '100' }] });

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

      const result = await writer.getSnapshotCount('SPY');

      expect(result).toBe(0);
    });

    it('should return 0 on count query failure', async () => {
      mockClient.query.mockRejectedValue(new Error('Count failed'));

      const { StockPriceWriter: Writer } =
        await import('../../../../src/modules/stock-price/writer.js');
      writer = new Writer();

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

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

      spyOnWithDatabaseClient(writer, mockClient);

      const result = await writer.getExistingDatesInRange(
        new Date('2024-12-01T00:00:00.000Z'),
        new Date('2024-12-31T00:00:00.000Z'),
      );

      expect(result).toEqual([]);
    });
  });
});
