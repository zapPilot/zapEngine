import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

import { StockPriceDmaService } from '../../../../src/modules/stock-price/dmaService.js';
import { StockPriceETLProcessor } from '../../../../src/modules/stock-price/processor.js';
import type {
  DailyStockPrice,
  StockPriceData,
} from '../../../../src/modules/stock-price/schema.js';
import { StockPriceWriter } from '../../../../src/modules/stock-price/writer.js';
import { YahooFinanceFetcher } from '../../../../src/modules/stock-price/yahooFetcher.js';
import type { ETLJob } from '../../../../src/types/index.js';

const { mockPool } = vi.hoisted(() => ({
  mockPool: {
    query: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => ({
  getDbPool: vi.fn().mockReturnValue(mockPool),
  getTableName: vi
    .fn()
    .mockImplementation((table: string) => `alpha_raw.${table.toLowerCase()}`),
}));

function createJob(overrides: Partial<ETLJob> = {}): ETLJob {
  return {
    jobId: 'stock-job-1',
    sources: ['stock-price'],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    status: 'pending',
    ...overrides,
  };
}

function createDailyPrice(overrides: Partial<DailyStockPrice> = {}) {
  return {
    date: '2026-05-01',
    priceUsd: 512.34,
    symbol: 'SPY',
    source: 'yahoo-finance',
    timestamp: new Date('2026-05-01T12:00:00.000Z'),
    ...overrides,
  };
}

function createHistoricalPrice(
  overrides: Partial<StockPriceData> = {},
): StockPriceData {
  return {
    priceUsd: 500,
    timestamp: new Date('2026-04-30T00:00:00.000Z'),
    source: 'yahoo-finance',
    symbol: 'SPY',
    ...overrides,
  };
}

describe('stock-price/processor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates processors with default and custom pools', () => {
    expect(new StockPriceETLProcessor()).toBeDefined();
    expect(
      new StockPriceETLProcessor(mockPool as unknown as Pool),
    ).toBeDefined();
  });

  it('processes the current SPY price and runs the DMA post-step', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchLatestPrice',
    ).mockResolvedValue(createDailyPrice());
    vi.spyOn(StockPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();
    vi.spyOn(
      StockPriceDmaService.prototype,
      'updateDmaForSymbol',
    ).mockResolvedValue({ recordsInserted: 200 });

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    const result = await processor.process(createJob());

    expect(result).toMatchObject({
      success: true,
      recordsProcessed: 1,
      recordsInserted: 1,
      source: 'stock-price',
    });
    expect(YahooFinanceFetcher.prototype.fetchLatestPrice).toHaveBeenCalledWith(
      'SPY',
    );
    expect(StockPriceWriter.prototype.insertSnapshot).toHaveBeenCalledWith(
      createDailyPrice(),
    );
    expect(
      StockPriceDmaService.prototype.updateDmaForSymbol,
    ).toHaveBeenCalledWith('SPY', 'stock-job-1');
    expect(processor.getStats()).toEqual({
      totalProcessed: 1,
      totalErrors: 0,
      lastProcessedAt: '2026-05-01T12:00:00.000Z',
    });
  });

  it('keeps a successful price result when the DMA post-step fails', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchLatestPrice',
    ).mockResolvedValue(createDailyPrice());
    vi.spyOn(StockPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();
    vi.spyOn(
      StockPriceDmaService.prototype,
      'updateDmaForSymbol',
    ).mockRejectedValue(new Error('dma failed'));

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    const result = await processor.process(createJob());

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(1);
  });

  it('records a failed process result when the price write fails', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchLatestPrice',
    ).mockResolvedValue(createDailyPrice());
    vi.spyOn(StockPriceWriter.prototype, 'insertSnapshot').mockRejectedValue(
      new Error('insert failed'),
    );
    const dmaSpy = vi.spyOn(
      StockPriceDmaService.prototype,
      'updateDmaForSymbol',
    );

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    const result = await processor.process(createJob());

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['insert failed']);
    expect(dmaSpy).not.toHaveBeenCalled();
    expect(processor.getStats()).toMatchObject({
      totalProcessed: 1,
      totalErrors: 1,
    });
  });

  it('processes a current price for an explicit symbol', async () => {
    const price = createDailyPrice({ symbol: 'QQQ' });
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchLatestPrice',
    ).mockResolvedValue(price);
    vi.spyOn(StockPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await processor.processCurrentPrice('QQQ');

    expect(YahooFinanceFetcher.prototype.fetchLatestPrice).toHaveBeenCalledWith(
      'QQQ',
    );
    expect(StockPriceWriter.prototype.insertSnapshot).toHaveBeenCalledWith(
      price,
    );
  });

  it('rethrows current price processing errors', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchLatestPrice',
    ).mockRejectedValue(new Error('quote unavailable'));

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.processCurrentPrice()).rejects.toThrow(
      'quote unavailable',
    );
  });

  it('backfills full history and reports insert counts', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchFullHistory',
    ).mockResolvedValue([
      createHistoricalPrice({ priceUsd: 500 }),
      createHistoricalPrice({
        priceUsd: 505,
        timestamp: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ]);
    vi.spyOn(StockPriceWriter.prototype, 'insertBatch').mockResolvedValue(2);

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    const result = await processor.backfillHistory(5, 'QQQ');

    expect(result).toEqual({
      requested: 5,
      existing: 0,
      fetched: 2,
      inserted: 2,
    });
    expect(YahooFinanceFetcher.prototype.fetchFullHistory).toHaveBeenCalledWith(
      'QQQ',
    );
    expect(StockPriceWriter.prototype.insertBatch).toHaveBeenCalledTimes(1);
  });

  it('rethrows backfill errors', async () => {
    vi.spyOn(
      YahooFinanceFetcher.prototype,
      'fetchFullHistory',
    ).mockRejectedValue(new Error('history unavailable'));

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.backfillHistory()).rejects.toThrow(
      'history unavailable',
    );
  });

  it('delegates manual DMA updates', async () => {
    vi.spyOn(
      StockPriceDmaService.prototype,
      'updateDmaForSymbol',
    ).mockResolvedValue({ recordsInserted: 12 });

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.updateDmaForSymbol('QQQ', 'job-2')).resolves.toEqual(
      {
        recordsInserted: 12,
      },
    );
    expect(
      StockPriceDmaService.prototype.updateDmaForSymbol,
    ).toHaveBeenCalledWith('QQQ', 'job-2');
  });

  it('reports healthy when API and latest snapshot are available today', async () => {
    vi.spyOn(YahooFinanceFetcher.prototype, 'healthCheck').mockResolvedValue({
      status: 'healthy',
      details: 'ok',
    });
    vi.spyOn(StockPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue(
      {
        date: '2026-05-01',
        price: 512.34,
        symbol: 'SPY',
      },
    );

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);
    const result = await processor.healthCheck();

    expect(result).toEqual({
      status: 'healthy',
      details: 'SPY price: $512.34 on 2026-05-01 (today)',
    });
  });

  it('describes yesterday and older snapshots in health details', async () => {
    vi.spyOn(YahooFinanceFetcher.prototype, 'healthCheck').mockResolvedValue({
      status: 'healthy',
      details: 'ok',
    });
    const latestSnapshotSpy = vi
      .spyOn(StockPriceWriter.prototype, 'getLatestSnapshot')
      .mockResolvedValueOnce({
        date: '2026-04-30',
        price: 510,
        symbol: 'SPY',
      })
      .mockResolvedValueOnce({
        date: '2026-04-28',
        price: 500,
        symbol: 'SPY',
      });

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.healthCheck()).resolves.toMatchObject({
      details: expect.stringContaining('(yesterday)'),
    });
    await expect(processor.healthCheck()).resolves.toMatchObject({
      details: expect.stringContaining('(3 days ago)'),
    });
    expect(latestSnapshotSpy).toHaveBeenCalledTimes(2);
  });

  it('reports unhealthy API and missing snapshot states', async () => {
    vi.spyOn(YahooFinanceFetcher.prototype, 'healthCheck')
      .mockResolvedValueOnce({ status: 'unhealthy', details: 'api down' })
      .mockResolvedValueOnce({ status: 'healthy' });
    vi.spyOn(StockPriceWriter.prototype, 'getLatestSnapshot')
      .mockResolvedValueOnce({
        date: '2026-05-01',
        price: 512.34,
        symbol: 'SPY',
      })
      .mockResolvedValueOnce(null);

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'unhealthy',
      details: 'api down',
    });
    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'unhealthy',
      details: 'No SPY data in database',
    });
  });

  it('reports unhealthy when health check dependencies throw', async () => {
    vi.spyOn(YahooFinanceFetcher.prototype, 'healthCheck').mockRejectedValue(
      new Error('health failed'),
    );

    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'unhealthy',
      details: 'health failed',
    });
  });

  it('exposes source metadata', () => {
    const processor = new StockPriceETLProcessor(mockPool as unknown as Pool);

    expect(processor.getSourceType()).toBe('stock-price');
    expect(processor.getStats()).toEqual({
      totalProcessed: 0,
      totalErrors: 0,
      lastProcessedAt: null,
    });
  });
});
