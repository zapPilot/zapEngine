import { describe, it, expect } from 'vitest';
import type {
  BaseETLProcessor,
  ETLProcessResult,
  HealthCheckResult,
} from '../../../../src/core/processors/baseETLProcessor.js';
import { ETLPipelineFactory } from '../../../../src/modules/core/pipelineFactory.js';
import type { ProcessorConstructor } from '../../../../src/modules/core/processorRegistry.js';
import type { DataSource, ETLJob } from '../../../../src/types/index.js';

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

function createRegistry(calls: string[]): Record<DataSource, ProcessorConstructor> {
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

  return {
    defillama: createCurrentProcessor('defillama', calls),
    debank: createCurrentProcessor('debank', calls),
    hyperliquid: createCurrentProcessor('hyperliquid', calls),
    feargreed: createCurrentProcessor('feargreed', calls),
    'macro-fear-greed': createCurrentProcessor('macro-fear-greed', calls),
    'token-price': TokenPriceProcessor,
    'stock-price': createCurrentProcessor('stock-price', calls),
  };
}

function createJob(overrides: Partial<ETLJob>): ETLJob {
  return {
    jobId: 'job-123',
    sources: ['defillama'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    status: 'pending',
    ...overrides,
  };
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

    expect(calls).toEqual(['backfill:BTC', 'dma:BTC', 'backfill:ETH', 'dma:ETH']);
    expect(result.recordsProcessed).toBe(6);
    expect(result.recordsInserted).toBe(2);
  });
});

