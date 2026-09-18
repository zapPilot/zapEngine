import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

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

describe('stock-price/dmaService coverage', () => {
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

  it('uses the default message when the DMA writer fails without errors', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          symbol: 'SPY',
          snapshot_date: '2026-05-01',
          price_usd: '500',
        },
      ],
    });

    const { StockPriceDmaWriter } =
      await import('../../../../src/modules/stock-price/dmaWriter.js');
    vi.spyOn(
      StockPriceDmaWriter.prototype,
      'writeDmaSnapshots',
    ).mockResolvedValue({
      success: false,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    });

    const { StockPriceDmaService } =
      await import('../../../../src/modules/stock-price/dmaService.js');
    const service = new StockPriceDmaService(mockPool as unknown as Pool);

    await expect(service.updateDmaForSymbol('SPY', 'job-1')).rejects.toThrow(
      'DMA write failed',
    );
  });
});
