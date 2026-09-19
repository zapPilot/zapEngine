import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/config/database.js')>();
  return {
    ...actual,
    getDbPool: vi.fn(() => ({ query: vi.fn() })),
    getDbClient: vi.fn(),
  };
});

import {
  BaseWriter,
  type WriteResult,
} from '../../src/core/database/baseWriter.js';
import { StockPriceETLProcessor } from '../../src/modules/stock-price/processor.js';
import { logger } from '../../src/utils/logger.js';

class UndefinedDuplicateWriter extends BaseWriter<{ id: string }> {
  public run(
    records: { id: string }[],
    writeBatch: (
      batch: { id: string }[],
      batchNumber: number,
    ) => Promise<WriteResult>,
  ) {
    return this.processBatches(
      records,
      writeBatch,
      'undefined duplicate metric',
    );
  }

  protected override mergeBatchResult(
    target: WriteResult,
    batchResult: WriteResult,
  ): void {
    super.mergeBatchResult(target, batchResult);
    target.duplicatesSkipped = undefined;
  }
}

describe('coverage handoff: alpha ETL final branch gaps', () => {
  it('logs zero when a writer leaves the optional duplicate metric undefined', async () => {
    const writer = new UndefinedDuplicateWriter();
    const result = await writer.run([{ id: 'one' }], async () => ({
      success: true,
      recordsInserted: 1,
      errors: [],
      duplicatesSkipped: undefined,
    }));

    expect(result.duplicatesSkipped).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      'undefined duplicate metric write completed',
      expect.objectContaining({
        totalRecords: 1,
        recordsInserted: 1,
        duplicatesSkipped: 0,
        errors: 0,
        success: true,
      }),
    );
  });

  it('reports missing stock snapshots when Yahoo itself is healthy', async () => {
    const processor = new StockPriceETLProcessor({ query: vi.fn() } as never);
    const internals = processor as unknown as {
      fetcher: { healthCheck: ReturnType<typeof vi.fn> };
      writer: { getLatestSnapshot: ReturnType<typeof vi.fn> };
    };
    internals.fetcher = {
      healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
    };
    internals.writer = {
      getLatestSnapshot: vi.fn().mockResolvedValue(null),
    };

    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'unhealthy',
      details: 'No SPY data in database',
    });
    expect(internals.fetcher.healthCheck).toHaveBeenCalledWith('SPY');
    expect(internals.writer.getLatestSnapshot).toHaveBeenCalledWith('SPY');
  });

  it('fails closed to unknown state for unexpected API statuses with snapshots', async () => {
    const processor = new StockPriceETLProcessor({ query: vi.fn() } as never);
    const internals = processor as unknown as {
      fetcher: { healthCheck: ReturnType<typeof vi.fn> };
      writer: { getLatestSnapshot: ReturnType<typeof vi.fn> };
    };
    internals.fetcher = {
      healthCheck: vi.fn().mockResolvedValue({ status: 'degraded' }),
    };
    internals.writer = {
      getLatestSnapshot: vi.fn().mockResolvedValue({
        date: '2026-05-01',
        price: 512.34,
        symbol: 'SPY',
      }),
    };

    await expect(processor.healthCheck()).resolves.toEqual({
      status: 'unhealthy',
      details: 'Unknown state',
    });
  });
});
