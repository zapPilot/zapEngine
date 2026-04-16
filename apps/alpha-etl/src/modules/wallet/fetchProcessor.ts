import { logger } from '../../utils/logger.js';
import { toErrorMessage } from '../../utils/errors.js';
import { maskWalletAddress } from '../../utils/mask.js';
import { executeETLFlow, createFailedETLResult, type BaseETLProcessor, type ETLProcessResult, type HealthCheckResult } from '../../core/processors/baseETLProcessor.js';
import type { ETLJob } from '../../types/index.js';
import type { WalletBalanceSnapshotInsert, PortfolioItemSnapshotInsert } from '../../types/database.js';
import { validateWalletFetchJob } from '../../core/processors/validation.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { DeBankFetcher } from './fetcher.js';
import { WalletBalanceTransformer } from './balanceTransformer.js';
import { DeBankPortfolioTransformer } from './portfolioTransformer.js';
import { WalletBalanceWriter } from './balanceWriter.js';
import { PortfolioItemWriter } from './portfolioWriter.js';
import {
  fetchWalletDataFromDeBank,
  mapTokenBalancesToSnapshots,
} from '../../modules/vip-users/common.js';
import {
  type WalletETLRecord,
  createMergedFetchResult,
  createWalletTransformCallback,
  createWalletLoadCallback,
} from './helpers.js';

/**
 * ETL processor for single-wallet fetch requests from account-engine webhooks
 *
 * Unlike WalletBalanceETLProcessor (VIP user batch processing), this processor:
 * - Processes a single wallet address from job.metadata.walletAddress
 * - No VIP user database fetching or activity filtering
 * - Always triggers MV refresh (even if 0 records)
 * - Used for on-demand wallet onboarding and refresh
 */
export class WalletFetchETLProcessor implements BaseETLProcessor {
  private debankFetcher: DeBankFetcher;
  private transformer: WalletBalanceTransformer;
  private writer: WalletBalanceWriter;
  private portfolioTransformer: DeBankPortfolioTransformer;
  private portfolioWriter: PortfolioItemWriter;

  constructor() {
    this.debankFetcher = new DeBankFetcher();
    this.transformer = new WalletBalanceTransformer();
    this.writer = new WalletBalanceWriter();
    this.portfolioTransformer = new DeBankPortfolioTransformer();
    this.portfolioWriter = new PortfolioItemWriter();
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    try {
      const metadata = validateWalletFetchJob(job);
      const walletAddress = metadata.walletAddress;

      logger.info('Starting wallet fetch ETL job', {
        jobId: job.jobId,
        wallet: maskWalletAddress(walletAddress),
        userId: job.metadata?.userId
      });

      const result = await executeETLFlow<WalletETLRecord, WalletETLRecord>(
        job,
        'debank',
        async () => {
          const { walletBalances, portfolioItems } = await this.fetchData(walletAddress, job.jobId);
          return createMergedFetchResult(walletBalances, portfolioItems);
        },
        createWalletTransformCallback(this.transformer, job.jobId, 'Wallet fetch'),
        createWalletLoadCallback(this.writer, this.portfolioWriter, job.jobId, 'Wallet fetch'),
        {
          allowEmptyFetch: true,
          allowEmptyTransform: true,
        }
      );

      logger.info('Wallet fetch ETL job completed', {
        jobId: job.jobId,
        wallet: maskWalletAddress(walletAddress),
        walletBalances: result.recordsInserted,
      });

      return result;

    } catch (error) {
      const message = toErrorMessage(error);
      this.logProcessError(job.jobId, message, error);
      return createFailedETLResult('debank', message);
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapHealthCheck(() => this.debankFetcher.healthCheck());
  }

  getStats(): Record<string, unknown> {
    return {
      debank: this.debankFetcher.getRequestStats()
    };
  }

  getSourceType(): string {
    return 'debank';
  }

  private async fetchData(walletAddress: string, jobId: string): Promise<{
    walletBalances: WalletBalanceSnapshotInsert[];
    portfolioItems: PortfolioItemSnapshotInsert[];
  }> {
    logger.info('Fetching DeBank data for single wallet', {
      jobId,
      wallet: maskWalletAddress(walletAddress)
    });

    try {
      const data = await fetchWalletDataFromDeBank(this.debankFetcher, walletAddress, {
        warningMessage: 'DeBank fetch failed - invalid response',
        context: { jobId }
      });

      if (!data) {
        return { walletBalances: [], portfolioItems: [] };
      }

      const walletBalances = mapTokenBalancesToSnapshots(data.tokens, walletAddress);

      // Transform protocol data to portfolio items
      const portfolioItems = this.portfolioTransformer.transformBatch(
        data.protocols,
        walletAddress
      );

      logger.info('DeBank wallet fetch completed', {
        jobId,
        wallet: maskWalletAddress(walletAddress),
        tokens: data.tokens.length,
        protocols: data.protocols.length,
        walletBalanceRecords: walletBalances.length,
        portfolioItemRecords: portfolioItems.length
      });

      return { walletBalances, portfolioItems };

    } catch (error) {
      logger.error('Failed to fetch DeBank data for wallet', {
        jobId,
        wallet: maskWalletAddress(walletAddress),
        error
      });
      throw error;
    }
  }

  private logProcessError(jobId: string, message: string, error: unknown): void {
    if (message === 'Wallet address missing from job metadata') {
      logger.error('Wallet address missing from job metadata', { jobId });
      return;
    }

    logger.error('Wallet fetch ETL job failed', { jobId, error });
  }
}
