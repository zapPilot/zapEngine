import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  type HealthCheckResult,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import { DeFiLlamaFetcher } from '../../modules/pool/fetcher.js';
import { PoolDataTransformer } from '../../modules/pool/transformer.js';
import { PoolWriter } from '../../modules/pool/writer.js';
import type { PoolAprSnapshotInsert } from '../../types/database.js';
import type { ETLJob, PoolData } from '../../types/index.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';

/**
 * ETL processor for pool APR data from DeFiLlama
 */
export class PoolETLProcessor implements BaseETLProcessor {
  private readonly fetcher: DeFiLlamaFetcher;
  private readonly transformer: PoolDataTransformer;
  private readonly writer: PoolWriter;

  constructor() {
    this.fetcher = new DeFiLlamaFetcher();
    this.transformer = new PoolDataTransformer();
    this.writer = new PoolWriter();
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    const filters = job.filters;
    const tvlThreshold = filters?.minTvl ?? 0;

    logger.info('Fetching DeFiLlama pools', {
      jobId: job.jobId,
      tvlThreshold,
    });

    return withValidatedJob(job, 'defillama', () =>
      executeETLFlow<PoolData, PoolAprSnapshotInsert>(
        job,
        'defillama',
        () => this.fetcher.fetchAllPools(tvlThreshold),
        async (rawData) => {
          const transformedData = this.transformer.transformBatch(
            rawData,
            'defillama',
          );
          if (transformedData.length === 0) {
            logger.warn('No valid data after transformation', {
              jobId: job.jobId,
            });
          }
          return transformedData;
        },
        async (transformedData) =>
          this.writer.writePoolSnapshots(transformedData, 'defillama'),
      ),
    );
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapHealthCheck(() => this.fetcher.healthCheck());
  }

  getStats(): Record<string, unknown> {
    return {
      defillama: this.fetcher.getRequestStats(),
    };
  }

  getSourceType(): string {
    return 'defillama';
  }
}
