import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  type HealthCheckResult,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import type { MacroFearGreedSnapshotInsert } from '../../types/database.js';
import type { ETLJob } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { MacroFearGreedFetcher } from './fetcher.js';
import type { MacroFearGreedData } from './schema.js';
import { MacroFearGreedTransformer } from './transformer.js';
import { MacroFearGreedWriter } from './writer.js';

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const FALLBACK_CACHE_SECONDS = 3 * 24 * 60 * 60;

export class MacroFearGreedETLProcessor implements BaseETLProcessor {
  private readonly fetcher: MacroFearGreedFetcher;
  private readonly transformer: MacroFearGreedTransformer;
  private readonly writer: MacroFearGreedWriter;

  constructor(config?: { apiUrl?: string }) {
    this.fetcher = new MacroFearGreedFetcher(config);
    this.transformer = new MacroFearGreedTransformer();
    this.writer = new MacroFearGreedWriter();
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    return withValidatedJob(job, 'macro-fear-greed', () =>
      executeETLFlow<MacroFearGreedData, MacroFearGreedSnapshotInsert>(
        job,
        'macro-fear-greed',
        async () => {
          const data = await this.fetchCurrentWithFallback(job.jobId);
          return [data];
        },
        async (rawData) => this.transformer.transformBatch(rawData),
        async (transformedData) => this.writer.writeSnapshots(transformedData),
      ),
    );
  }

  async backfillHistory(startDate = '2021-01-01'): Promise<{
    requested: number;
    existing: number;
    fetched: number;
    inserted: number;
  }> {
    logger.info('Starting macro Fear & Greed backfill', { startDate });
    const historical = await this.fetcher.fetchHistory(startDate);
    const transformed = this.transformer.transformBatch(historical);
    const writeResult = await this.writer.writeSnapshots(transformed);
    if (!writeResult.success) {
      throw new Error(
        writeResult.errors[0] ?? 'Macro Fear & Greed backfill write failed',
      );
    }
    const result = {
      requested: transformed.length,
      existing: writeResult.duplicatesSkipped ?? 0,
      fetched: historical.length,
      inserted: writeResult.recordsInserted,
    };
    logger.info('Macro Fear & Greed backfill completed', {
      startDate,
      ...result,
    });
    return result;
  }

  private async fetchCurrentWithFallback(
    jobId: string,
  ): Promise<MacroFearGreedData> {
    const freshCache = await this.writer.getLatestSnapshot(CACHE_TTL_SECONDS);
    if (freshCache) {
      return freshCache;
    }

    try {
      return await this.fetcher.fetchCurrent();
    } catch (error) {
      logger.warn(
        'CNN macro Fear & Greed fetch failed, trying stale DB fallback',
        {
          jobId,
          error: toErrorMessage(error),
        },
      );
      const fallback = await this.writer.getLatestSnapshot(
        FALLBACK_CACHE_SECONDS,
      );
      if (fallback) {
        return fallback;
      }
      throw error;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapHealthCheck(() => this.fetcher.healthCheck());
  }

  getStats(): Record<string, unknown> {
    return {
      macroFearGreed: this.fetcher.getRequestStats(),
    };
  }

  getSourceType(): string {
    return 'macro-fear-greed';
  }
}
