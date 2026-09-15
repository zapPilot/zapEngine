import { describe, it, expect, vi } from 'vitest';
import type {
  BaseETLProcessor,
  ETLProcessResult,
  HealthCheckResult,
} from '../../../../src/core/processors/baseETLProcessor.js';
import { ETLPipelineFactory } from '../../../../src/modules/core/pipelineFactory.js';
import type { ProcessorConstructor } from '../../../../src/modules/core/processorRegistry.js';
import type { DataSource, ETLJob } from '../../../../src/types/index.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

function createResult(source: DataSource): ETLProcessResult {
  return {
    success: true,
    recordsProcessed: 1,
    recordsInserted: 1,
    errors: [],
    source,
  };
}

function createCurrentProcessor(
  source: DataSource,
  calls: string[],
): ProcessorConstructor {
  return class CurrentProcessor implements BaseETLProcessor {
    async process(): Promise<ETLProcessResult> {
      calls.push(`current:${source}`);
      return createResult(source);
    }

    async healthCheck(): Promise<HealthCheckResult> {
      return { status: 'healthy' };
    }

    getStats(): Record<string, unknown> {
      return {};
    }

    getSourceType(): string {
      return source;
    }
  };
}

function createRegistry(
  calls: string[],
): Record<DataSource, ProcessorConstructor> {
  class TokenPriceProcessor implements BaseETLProcessor {
    async process(): Promise<ETLProcessResult> {
      calls.push('current:token-price');
      return createResult('token-price');
    }

    async backfillHistory(
      daysBack = 30,
      _tokenId = 'bitcoin',
      tokenSymbol = 'BTC',
    ): Promise<{
      requested: number;
      existing: number;
      fetched: number;
      inserted: number;
    }> {
      calls.push(`backfill:${tokenSymbol}`);
      return { requested: daysBack, existing: 0, fetched: 1, inserted: 1 };
    }

    async updateDmaForToken(tokenSymbol = 'BTC'): Promise<{
      recordsInserted: number;
    }> {
      calls.push(`dma:${tokenSymbol}`);
      return { recordsInserted: 1 };
    }

    async healthCheck(): Promise<HealthCheckResult> {
      return { status: 'healthy' };
    }

    getStats(): Record<string, unknown> {
      return {};
    }

    getSourceType(): string {
      return 'token-price';
    }
  }

  class MacroFearGreedProcessor implements BaseETLProcessor {
    async process(): Promise<ETLProcessResult> {
      calls.push('current:macro-fear-greed');
      return createResult('macro-fear-greed');
    }

    async backfillHistory(startDate = '2021-01-01'): Promise<{
      requested: number;
      existing: number;
      fetched: number;
      inserted: number;
    }> {
      calls.push(`macro-backfill:${startDate}`);
      return { requested: 4, existing: 1, fetched: 4, inserted: 3 };
    }

    async healthCheck(): Promise<HealthCheckResult> {
      return { status: 'healthy' };
    }

    getStats(): Record<string, unknown> {
      return {};
    }

    getSourceType(): string {
      return 'macro-fear-greed';
    }
  }

  return {
    debank: createCurrentProcessor('debank', calls),
    hyperliquid: createCurrentProcessor('hyperliquid', calls),
    feargreed: createCurrentProcessor('feargreed', calls),
    'macro-fear-greed': MacroFearGreedProcessor,
    'token-price': TokenPriceProcessor,
    'stock-price': createCurrentProcessor('stock-price', calls),
  };
}

function createJob(overrides: Partial<ETLJob>): ETLJob {
  return createEtlJob({
    ...overrides,
  });
}

describe('ETLPipelineFactory task jobs', () => {
  it('processes current-source tasks sequentially', async () => {
    const calls: string[] = [];
    const factory = new ETLPipelineFactory(createRegistry(calls));

    await factory.processJob(
      createJob({
        sources: ['hyperliquid', 'debank'],
        tasks: [
          { source: 'hyperliquid', operation: 'current' },
          { source: 'debank', operation: 'current' },
        ],
      }),
    );

    expect(calls).toEqual(['current:hyperliquid', 'current:debank']);
  });

  it('processes token backfill tokens sequentially', async () => {
    const calls: string[] = [];
    const factory = new ETLPipelineFactory(createRegistry(calls));

    const result = await factory.processJob(
      createJob({
        sources: ['token-price'],
        tasks: [
          {
            source: 'token-price',
            operation: 'backfill',
            tokens: [
              { tokenId: 'bitcoin', tokenSymbol: 'BTC', daysBack: 3 },
              { tokenId: 'ethereum', tokenSymbol: 'ETH', daysBack: 3 },
            ],
          },
        ],
      }),
    );

    expect(calls).toEqual([
      'backfill:BTC',
      'dma:BTC',
      'backfill:ETH',
      'dma:ETH',
    ]);
    expect(result.recordsProcessed).toBe(6);
    expect(result.recordsInserted).toBe(2);
  });

  it('uses the default history window when token daysBack is omitted', async () => {
    const calls: string[] = [];
    const factory = new ETLPipelineFactory(createRegistry(calls));

    const result = await factory.processJob(
      createJob({
        sources: ['token-price'],
        tasks: [
          {
            source: 'token-price',
            operation: 'backfill',
            tokens: [{ tokenId: 'bitcoin', tokenSymbol: 'BTC' }],
          },
        ],
      }),
    );

    expect(result.recordsProcessed).toBe(30);
    expect(calls).toEqual(['backfill:BTC', 'dma:BTC']);
  });

  it('records a token backfill failure and continues with later tokens', async () => {
    const calls: string[] = [];
    const factory = new ETLPipelineFactory(createRegistry(calls));
    const processor = factory.getProcessor(
      'token-price',
    ) as BaseETLProcessor & {
      backfillHistory: (
        daysBack: number,
        tokenId: string,
        tokenSymbol: string,
      ) => Promise<unknown>;
    };
    vi.spyOn(processor, 'backfillHistory')
      .mockRejectedValueOnce(new Error('history unavailable'))
      .mockResolvedValueOnce({
        requested: 2,
        existing: 0,
        fetched: 2,
        inserted: 2,
      });

    const result = await factory.processJob(
      createJob({
        sources: ['token-price'],
        tasks: [
          {
            source: 'token-price',
            operation: 'backfill',
            tokens: [
              { tokenId: 'bitcoin', tokenSymbol: 'BTC', daysBack: 2 },
              { tokenId: 'ethereum', tokenSymbol: 'ETH', daysBack: 2 },
            ],
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['token-price: BTC: history unavailable']);
    expect(result.recordsProcessed).toBe(2);
    expect(calls).toContain('dma:ETH');
    expect(calls).not.toContain('dma:BTC');
  });

  it('processes macro Fear & Greed backfill work', async () => {
    const calls: string[] = [];
    const factory = new ETLPipelineFactory(createRegistry(calls));

    const result = await factory.processJob(
      createJob({
        sources: ['macro-fear-greed'],
        tasks: [
          {
            source: 'macro-fear-greed',
            operation: 'backfill',
            startDate: '2022-01-01',
          },
        ],
      }),
    );

    expect(calls).toEqual(['macro-backfill:2022-01-01']);
    expect(result).toMatchObject({
      success: true,
      recordsProcessed: 4,
      recordsInserted: 3,
    });
  });

  it('reports macro Fear & Greed backfill failures', async () => {
    const factory = new ETLPipelineFactory(createRegistry([]));
    const processor = factory.getProcessor(
      'macro-fear-greed',
    ) as BaseETLProcessor & {
      backfillHistory: (startDate: string) => Promise<unknown>;
    };
    vi.spyOn(processor, 'backfillHistory').mockRejectedValue(
      'provider offline',
    );

    const result = await factory.processJob(
      createJob({
        sources: ['macro-fear-greed'],
        tasks: [
          {
            source: 'macro-fear-greed',
            operation: 'backfill',
            startDate: '2022-01-01',
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['macro-fear-greed: Unknown error']);
  });

  it('treats an absent task list as empty inside task processing', async () => {
    const factory = new ETLPipelineFactory(createRegistry([]));
    const seam = factory as unknown as {
      processTasksForJob: (
        job: ETLJob,
        result: {
          success: boolean;
          recordsProcessed: number;
          recordsInserted: number;
          errors: string[];
          sourceResults: Partial<Record<DataSource, ETLProcessResult>>;
        },
      ) => Promise<unknown>;
    };
    const result = {
      success: true,
      recordsProcessed: 0,
      recordsInserted: 0,
      errors: [],
      sourceResults: {},
    };

    await seam.processTasksForJob(createJob({ tasks: undefined }), result);

    expect(result.sourceResults).toEqual({});
  });
});
