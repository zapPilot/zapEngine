import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  type HealthCheckResult,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import type { SentimentSnapshotInsert } from '../../types/database.js';
import type { ETLJob } from '../../types/index.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { FearGreedFetcher, type SentimentData } from './fetcher.js';
import { SentimentDataTransformer } from './transformer.js';
import { SentimentWriter } from './writer.js';

/**
 * ETL Processor for Fear & Greed Index sentiment data
 *
 * Orchestrates the complete ETL pipeline:
 * 1. Fetch current sentiment from CoinMarketCap API
 * 2. Transform and validate sentiment data
 * 3. Write sentiment snapshot to database
 */
export class SentimentETLProcessor implements BaseETLProcessor {
  private readonly fetcher: FearGreedFetcher;
  private readonly transformer: SentimentDataTransformer;
  private readonly writer: SentimentWriter;

  constructor(config?: { apiKey?: string; apiUrl?: string }) {
    this.fetcher = new FearGreedFetcher(config);
    this.transformer = new SentimentDataTransformer();
    this.writer = new SentimentWriter();
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    return withValidatedJob(job, 'feargreed', () =>
      executeETLFlow<SentimentData, SentimentSnapshotInsert>(
        job,
        'feargreed',
        async () => {
          logger.info('Fetching Fear & Greed Index', { jobId: job.jobId });
          const sentimentData = await this.fetcher.fetchCurrentSentiment();
          logger.info('Sentiment data fetched successfully', {
            jobId: job.jobId,
            value: sentimentData.value,
            classification: sentimentData.classification,
          });
          return [sentimentData];
        },
        async (rawData) => {
          const raw = rawData[0]!;

          logger.info('Transforming sentiment data', {
            jobId: job.jobId,
            value: raw.value,
            classification: raw.classification,
          });

          const transformed = this.transformer.transform(raw);
          if (!transformed) {
            throw new Error('Sentiment data failed validation');
          }

          logger.info('Sentiment transformation completed', {
            jobId: job.jobId,
            sentiment_value: transformed.sentiment_value,
            classification: transformed.classification,
          });

          return [transformed];
        },
        async (transformedData) => {
          logger.info('Writing sentiment data to database', {
            jobId: job.jobId,
            recordCount: transformedData.length,
          });

          const writeResult = await this.writer.writeSentimentSnapshots(
            transformedData,
            'feargreed',
          );

          logger.info('Sentiment database write completed', {
            jobId: job.jobId,
            recordsInserted: writeResult.recordsInserted,
            duplicatesSkipped: writeResult.duplicatesSkipped,
            errors: writeResult.errors.length,
            success: writeResult.success,
          });

          return writeResult;
        },
      ),
    );
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapHealthCheck(() => this.fetcher.healthCheck());
  }

  getStats(): Record<string, unknown> {
    return {
      feargreed: this.fetcher.getRequestStats(),
    };
  }

  getSourceType(): string {
    return 'feargreed';
  }
}
