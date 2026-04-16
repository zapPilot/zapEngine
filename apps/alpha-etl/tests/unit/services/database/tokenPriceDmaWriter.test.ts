import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenPriceDmaWriter } from '../../../../src/modules/token-price/dmaWriter.js';

describe('TokenPriceDmaWriter', () => {
  let writer: TokenPriceDmaWriter;
  let mockClient: { query: ReturnType<typeof vi.fn> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let withDatabaseClientSpy: any;

  beforeEach(() => {
    mockClient = { query: vi.fn() };
    writer = new TokenPriceDmaWriter();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withDatabaseClientSpy = vi.spyOn(writer as any, 'withDatabaseClient');
    withDatabaseClientSpy.mockImplementation(async (fn: unknown) => {
      return await (fn as (client: unknown) => Promise<unknown>)(mockClient);
    });
  });

  it('should upsert DMA rows on conflict and update price fields', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: 'row-1' }],
      rowCount: 1
    });

    await writer.writeDmaSnapshots([
      {
        token_symbol: 'BTC',
        token_id: 'bitcoin',
        snapshot_date: '2026-02-08',
        price_usd: 108_000,
        dma_200: 97_500,
        price_vs_dma_ratio: 1.107692,
        is_above_dma: true,
        days_available: 200,
        source: 'coingecko',
        snapshot_time: '2026-02-08T00:00:00.000Z'
      }
    ]);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (source, token_symbol, snapshot_date)'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('DO UPDATE SET'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('price_usd = EXCLUDED.price_usd'),
      expect.any(Array)
    );
  });

  it('should read latest DMA snapshot scoped to coingecko source', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        snapshot_date: new Date('2026-02-08T00:00:00.000Z'),
        price_usd: '108000.50',
        dma_200: '97500.10',
        is_above_dma: true
      }],
      rowCount: 1
    });

    const latest = await writer.getLatestDmaSnapshot('BTC');

    expect(latest).toEqual({
      date: '2026-02-08',
      price: 108000.5,
      dma200: 97500.1,
      isAboveDma: true
    });
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.any(String),
      ['coingecko', 'BTC']
    );
  });

  it('should handle snapshot_date as a string (not Date object)', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        snapshot_date: '2026-02-08',
        price_usd: '108000.50',
        dma_200: '97500.10',
        is_above_dma: true
      }],
      rowCount: 1
    });

    const latest = await writer.getLatestDmaSnapshot('BTC');

    expect(latest).toEqual({
      date: '2026-02-08',
      price: 108000.5,
      dma200: 97500.1,
      isAboveDma: true
    });
  });

  it('should return null dma200 when dma_200 is null', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        snapshot_date: new Date('2026-02-08T00:00:00.000Z'),
        price_usd: '108000.50',
        dma_200: null,
        is_above_dma: null
      }],
      rowCount: 1
    });

    const latest = await writer.getLatestDmaSnapshot('BTC');

    expect(latest).toEqual({
      date: '2026-02-08',
      price: 108000.5,
      dma200: null,
      isAboveDma: null
    });
  });

  it('should return null dma200 when dma_200 is undefined', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{
        snapshot_date: new Date('2026-02-08T00:00:00.000Z'),
        price_usd: '108000.50',
        dma_200: undefined,
        is_above_dma: null
      }],
      rowCount: 1
    });

    const latest = await writer.getLatestDmaSnapshot('BTC');

    expect(latest?.dma200).toBeNull();
  });

  it('should return null when no rows exist', async () => {
    mockClient.query.mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    const latest = await writer.getLatestDmaSnapshot('BTC');
    expect(latest).toBeNull();
  });

  it('should return null and log error when query throws', async () => {
    mockClient.query.mockRejectedValue(new Error('Connection lost'));

    const latest = await writer.getLatestDmaSnapshot('BTC');
    expect(latest).toBeNull();
  });

  it('should track inserted records from rowCount', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: 'row-1' }],
      rowCount: 2
    });

    const result = await writer.writeDmaSnapshots([
      {
        token_symbol: 'BTC',
        token_id: 'bitcoin',
        snapshot_date: '2026-02-08',
        price_usd: 108_000,
        dma_200: 97_500,
        price_vs_dma_ratio: 1.107692,
        is_above_dma: true,
        days_available: 200,
        source: 'coingecko',
        snapshot_time: '2026-02-08T00:00:00.000Z'
      }
    ]);

    expect(result.recordsInserted).toBe(2);
  });

  it('should handle empty batch in writeBatch', async () => {
    const result = await writer.writeDmaSnapshots([]);

    expect(result.recordsInserted).toBe(0);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('should handle write errors gracefully in writeBatch', async () => {
    mockClient.query.mockRejectedValue(new Error('Insert failed'));

    const result = await writer.writeDmaSnapshots([
      {
        token_symbol: 'BTC',
        token_id: 'bitcoin',
        snapshot_date: '2026-02-08',
        price_usd: 108_000,
        dma_200: 97_500,
        price_vs_dma_ratio: 1.107692,
        is_above_dma: true,
        days_available: 200,
        source: 'coingecko',
        snapshot_time: '2026-02-08T00:00:00.000Z'
      }
    ]);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Insert failed');
  });
});
