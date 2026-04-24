import type { Pool } from 'pg';

import { getDbPool } from '../../config/database.js';
import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  type HealthCheckResult,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import {
  type BackfillDateRange,
  fetchMissingDateSnapshots,
  getBackfillDateRange,
  getExistingDates,
  logGapDetectionSummary,
} from '../../modules/token-price/backfill.helpers.js';
import {
  CoinGeckoFetcher,
  type TokenPriceData,
} from '../../modules/token-price/fetcher.js';
import {
  buildHealthCheckDetails,
  calculateSuccessRate,
  getOptionalDmaHealthInfo,
  resolveHealthStatus,
  updateStatsAfterProcess,
  writeSnapshotData,
} from '../../modules/token-price/processor.helpers.js';
import { TokenPriceWriter } from '../../modules/token-price/writer.js';
import type { ETLJob } from '../../types/index.js';
import {
  calculateMissingDates,
  formatDateToYYYYMMDD,
  generateDateRange,
} from '../../utils/dateUtils.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { TokenPriceDmaService } from './dmaService.js';

export class TokenPriceETLProcessor implements BaseETLProcessor {
  private static readonly DEFAULT_TOKEN_ID = 'bitcoin';
  private static readonly DEFAULT_TOKEN_SYMBOL = 'BTC';

  private fetcher: CoinGeckoFetcher;
  private writer: TokenPriceWriter;
  private dmaService: TokenPriceDmaService;
  private stats = {
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null as Date | null,
  };

  constructor(pool?: Pool) {
    this.fetcher = new CoinGeckoFetcher();
    this.writer = new TokenPriceWriter();
    this.dmaService = new TokenPriceDmaService(pool ?? getDbPool());
  }

  /**
   * Process token price snapshot for an ETL job
   *
   * Fetches current price for the default token (BTC) and stores it.
   */
  async process(job: ETLJob): Promise<ETLProcessResult> {
    return withValidatedJob(job, 'token-price', async () => {
      logger.info('Processing token price snapshot', { jobId: job.jobId });

      const result = await this.executeProcessFlow(job);
      updateStatsAfterProcess(this.stats, result.success);
      if (result.success) {
        await this.updateDmaAfterPriceWrite(job.jobId);
      }

      logger.info('Token price snapshot processing completed', {
        jobId: job.jobId,
        recordsInserted: result.recordsInserted,
      });

      return result;
    });
  }

  /**
   * Run DMA computation as a non-fatal post-step after price data is written.
   * DMA is a derived metric — failure here does not invalidate the primary price data.
   */
  private async updateDmaAfterPriceWrite(jobId: string): Promise<void> {
    try {
      const dmaResult = await this.updateDmaForToken(
        TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL,
        TokenPriceETLProcessor.DEFAULT_TOKEN_ID,
        jobId,
      );
      logger.info('DMA post-step completed', {
        jobId,
        dmaRecordsInserted: dmaResult.recordsInserted,
      });
    } catch (error) {
      logger.warn('DMA post-step failed (non-fatal)', {
        jobId,
        error: toErrorMessage(error),
      });
    }
  }

  /**
   * Fetch and store current token price (daily ETL job)
   *
   * This is the main entry point for the daily scheduled job
   *
   * @param tokenId - CoinGecko token ID (default: 'bitcoin')
   * @param tokenSymbol - Token symbol (default: 'BTC')
   * @returns Promise<void>
   * @throws Error if ETL operation fails
   */
  async processCurrentPrice(
    tokenId: string = TokenPriceETLProcessor.DEFAULT_TOKEN_ID,
    tokenSymbol: string = TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL,
  ): Promise<void> {
    logger.info('Starting token price ETL job', { tokenId, tokenSymbol });

    try {
      const priceData = await this.fetcher.fetchCurrentPrice(
        tokenId,
        tokenSymbol,
      );
      await this.writer.insertSnapshot(priceData);

      logger.info('Token price ETL completed successfully', {
        tokenId,
        tokenSymbol,
        price: priceData.priceUsd,
        marketCap: priceData.marketCapUsd,
        date: formatDateToYYYYMMDD(priceData.timestamp),
      });
    } catch (error) {
      logger.error('Token price ETL failed', {
        tokenId,
        tokenSymbol,
        error: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Backfill historical prices with intelligent gap detection
   *
   * Queries database first to identify missing dates, then only fetches those
   *
   * @param daysBack - Number of days to backfill (default: 30)
   * @param tokenId - CoinGecko token ID (default: 'bitcoin')
   * @param tokenSymbol - Token symbol (default: 'BTC')
   * @returns Promise<{ requested: number; existing: number; fetched: number; inserted: number }>
   */
  async backfillHistory(
    daysBack = 30,
    tokenId: string = TokenPriceETLProcessor.DEFAULT_TOKEN_ID,
    tokenSymbol: string = TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL,
  ): Promise<{
    requested: number;
    existing: number;
    fetched: number;
    inserted: number;
  }> {
    logger.info('Starting token price backfill', {
      daysBack,
      tokenId,
      tokenSymbol,
    });

    const { startDate, endDate }: BackfillDateRange =
      getBackfillDateRange(daysBack);
    const existingDates = await getExistingDates(
      this.writer,
      startDate,
      endDate,
      tokenSymbol,
      daysBack,
    );

    const allDates = generateDateRange(startDate, endDate);
    const missingDates = calculateMissingDates(allDates, existingDates);
    logGapDetectionSummary(
      existingDates,
      missingDates,
      startDate,
      endDate,
      tokenSymbol,
      daysBack,
    );

    const snapshots = await fetchMissingDateSnapshots(
      missingDates,
      tokenId,
      tokenSymbol,
      this.fetcher,
    );
    const inserted = await this.writer.insertBatch(snapshots);

    const result = {
      requested: daysBack,
      existing: existingDates.length,
      fetched: snapshots.length,
      inserted,
    };

    logger.info('Token price backfill completed', {
      ...result,
      tokenId,
      tokenSymbol,
    });
    return result;
  }

  /**
   * Compute and upsert 200 DMA snapshots for a specific token.
   *
   * Used by backfill route to keep derived DMA data aligned with freshly written
   * historical token prices.
   */
  async updateDmaForToken(
    tokenSymbol: string = TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL,
    tokenId: string = TokenPriceETLProcessor.DEFAULT_TOKEN_ID,
    jobId?: string,
  ): Promise<{ recordsInserted: number }> {
    const result = await this.dmaService.updateDmaForToken(
      tokenSymbol,
      tokenId,
      jobId,
    );
    await this.updateEthBtcRatioAfterDma(tokenSymbol, jobId);
    return result;
  }

  /**
   * Health check for token price pipeline
   *
   * Checks API connectivity, database status, and data freshness
   *
   * @returns Promise<HealthCheckResult>
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const tokenId = TokenPriceETLProcessor.DEFAULT_TOKEN_ID;
    const tokenSymbol = TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL;

    try {
      const apiHealth = await this.fetcher.healthCheck(tokenId, tokenSymbol);
      const latestSnapshot = await this.writer.getLatestSnapshot(tokenSymbol);
      const totalSnapshots = await this.writer.getSnapshotCount(tokenSymbol);
      const { status, freshness } = resolveHealthStatus(
        latestSnapshot?.date,
        apiHealth.status,
      );
      const dmaInfo = await getOptionalDmaHealthInfo(
        this.dmaService,
        tokenSymbol,
      );

      return {
        status,
        details: buildHealthCheckDetails(
          tokenId,
          tokenSymbol,
          apiHealth.status,
          latestSnapshot,
          totalSnapshots,
          freshness,
          dmaInfo,
        ),
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error('Health check failed', {
        tokenId,
        tokenSymbol,
        error: errorMessage,
      });
      return {
        status: 'unhealthy',
        details: errorMessage,
      };
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): Record<string, unknown> {
    return {
      totalProcessed: this.stats.totalProcessed,
      totalErrors: this.stats.totalErrors,
      lastProcessedAt: this.stats.lastProcessedAt?.toISOString() ?? null,
      successRate: calculateSuccessRate(this.stats),
    };
  }

  /**
   * Get the data source type this processor handles
   */
  getSourceType(): string {
    return 'token-price';
  }

  private async executeProcessFlow(job: ETLJob): Promise<ETLProcessResult> {
    return executeETLFlow<TokenPriceData, TokenPriceData>(
      job,
      'token-price',
      async () => {
        const priceData = await this.fetcher.fetchCurrentPrice(
          TokenPriceETLProcessor.DEFAULT_TOKEN_ID,
          TokenPriceETLProcessor.DEFAULT_TOKEN_SYMBOL,
        );
        return [priceData];
      },
      async (rawData) => rawData,
      async (data) => writeSnapshotData(data, this.writer),
    );
  }

  private async updateEthBtcRatioAfterDma(
    tokenSymbol: string,
    jobId?: string,
  ): Promise<void> {
    if (!this.shouldRefreshEthBtcRatio(tokenSymbol)) {
      return;
    }

    try {
      const ratioResult = await this.dmaService.updateEthBtcRatioDma(jobId);
      logger.info('ETH/BTC ratio DMA post-step completed', {
        jobId,
        tokenSymbol,
        ratioRecordsInserted: ratioResult.recordsInserted,
      });
    } catch (error) {
      logger.warn('ETH/BTC ratio DMA post-step failed (non-fatal)', {
        jobId,
        tokenSymbol,
        error: toErrorMessage(error),
      });
    }
  }

  private shouldRefreshEthBtcRatio(tokenSymbol: string): boolean {
    const normalizedSymbol = tokenSymbol.trim().toUpperCase();
    return normalizedSymbol === 'BTC' || normalizedSymbol === 'ETH';
  }
}
