/**
 * Stock Price ETL Processor
 *
 * Processes S&P500 (SPY) daily price data from Yahoo Finance API.
 * Mirrors TokenPriceETLProcessor pattern.
 *
 * Data Source: Yahoo Finance API (historical endpoint)
 * Destination: alpha_raw.stock_price_snapshots, alpha_raw.stock_price_dma_snapshots
 */

import type { Pool } from 'pg';

import { writeFileSync } from 'node:fs';

import { getDbPool } from '../../config/database.js';
import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  type HealthCheckResult,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import { StockPriceDmaService } from '../../modules/stock-price/dmaService.js';
import { StockPriceWriter } from '../../modules/stock-price/writer.js';
import { YahooFinanceFetcher } from '../../modules/stock-price/yahooFetcher.js';
import type { ETLJob } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export class StockPriceETLProcessor implements BaseETLProcessor {
  private static readonly DEFAULT_SYMBOL = 'SPY';

  private fetcher: YahooFinanceFetcher;
  private writer: StockPriceWriter;
  private dmaService: StockPriceDmaService;
  private stats = {
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null as Date | null,
  };

  constructor(pool?: Pool) {
    this.fetcher = new YahooFinanceFetcher();
    this.writer = new StockPriceWriter();
    this.dmaService = new StockPriceDmaService(pool ?? getDbPool());
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    return withValidatedJob(job, 'stock-price', async () => {
      logger.info('Processing stock price snapshot', { jobId: job.jobId });

      const result = await this.executeProcessFlow(job);
      this.updateStatsAfterProcess(result.success);
      if (result.success) {
        await this.updateDmaAfterPriceWrite(job.jobId);
      }

      logger.info('Stock price snapshot processing completed', {
        jobId: job.jobId,
        recordsInserted: result.recordsInserted,
      });

      return result;
    });
  }

  private async updateDmaAfterPriceWrite(jobId: string): Promise<void> {
    try {
      const dmaResult = await this.dmaService.updateDmaForSymbol(
        StockPriceETLProcessor.DEFAULT_SYMBOL,
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

  async processCurrentPrice(
    symbol: string = StockPriceETLProcessor.DEFAULT_SYMBOL,
  ): Promise<void> {
    logger.info('Starting stock price ETL job', { symbol });

    try {
      const priceData = await this.fetcher.fetchLatestPrice(symbol);
      await this.writer.insertSnapshot(priceData);

      logger.info('Stock price ETL completed successfully', {
        symbol,
        price: priceData.priceUsd,
        date: priceData.date,
      });
    } catch (error) {
      logger.error('Stock price ETL failed', {
        symbol,
        error: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async backfillHistory(
    daysBack = 365 * 5,
    symbol: string = StockPriceETLProcessor.DEFAULT_SYMBOL,
  ): Promise<{
    requested: number;
    existing: number;
    fetched: number;
    inserted: number;
  }> {
    logger.info('Starting stock price backfill', {
      daysBack,
      symbol,
    });

    try {
      const allData = await this.fetcher.fetchFullHistory(symbol);

      writeFileSync('/tmp/spy-backfill-debug.json', JSON.stringify(allData, null, 2));

      const inserted = await this.writer.insertBatch(allData);

      const result = {
        requested: daysBack,
        existing: 0,
        fetched: allData.length,
        inserted,
      };

      logger.info('Stock price backfill completed', {
        ...result,
        symbol,
      });
      return result;
    } catch (error) {
      logger.error('Stock price backfill failed', {
        symbol,
        error: toErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  async updateDmaForSymbol(
    symbol: string = StockPriceETLProcessor.DEFAULT_SYMBOL,
    jobId?: string,
  ): Promise<{ recordsInserted: number }> {
    return this.dmaService.updateDmaForSymbol(symbol, jobId);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const symbol = StockPriceETLProcessor.DEFAULT_SYMBOL;

    try {
      const apiHealth = await this.fetcher.healthCheck(symbol);
      const latestSnapshot = await this.writer.getLatestSnapshot(symbol);

      let status: 'healthy' | 'unhealthy' = 'unhealthy';
      let details = 'Unknown state';

      if (apiHealth.status === 'healthy' && latestSnapshot) {
        status = 'healthy';
        const freshness = this.computeFreshness(latestSnapshot.date);
        details = `${symbol} price: $${latestSnapshot.price.toFixed(2)} on ${latestSnapshot.date} (${freshness})`;
      } else if (apiHealth.status === 'unhealthy') {
        details = apiHealth.details ?? 'API unhealthy';
      } else if (!latestSnapshot) {
        details = `No ${symbol} data in database`;
      }

      return { status, details };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error('Health check failed', {
        symbol,
        error: errorMessage,
      });
      return { status: 'unhealthy', details: errorMessage };
    }
  }

  private computeFreshness(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    return `${diffDays} days ago`;
  }

  getStats(): Record<string, unknown> {
    return {
      totalProcessed: this.stats.totalProcessed,
      totalErrors: this.stats.totalErrors,
      lastProcessedAt: this.stats.lastProcessedAt?.toISOString() ?? null,
    };
  }

  getSourceType(): string {
    return 'stock-price';
  }

  private async executeProcessFlow(job: ETLJob): Promise<ETLProcessResult> {
    return executeETLFlow<never, never>(
      job,
      'stock-price',
      async () => {
        await this.fetcher.fetchLatestPrice(
          StockPriceETLProcessor.DEFAULT_SYMBOL,
        );
        return [];
      },
      async () => {
        throw new Error('Should not reach here');
      },
      async () => {
        const priceData = await this.fetcher.fetchLatestPrice(
          StockPriceETLProcessor.DEFAULT_SYMBOL,
        );
        await this.writer.insertSnapshot(priceData);
        return { recordsInserted: 1, success: true, errors: [] };
      },
    );
  }

  private updateStatsAfterProcess(success: boolean): void {
    this.stats.totalProcessed += 1;
    if (!success) {
      this.stats.totalErrors += 1;
    }
    this.stats.lastProcessedAt = new Date();
  }
}
