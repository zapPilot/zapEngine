import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import { buildRequestStats } from '../../modules/core/processorStats.js';
import {
  fetchWalletDataFromDeBank,
  mapTokenBalancesToSnapshots,
} from '../../modules/vip-users/common.js';
import {
  fetchAndFilterVipUsersForProcessing,
  updatePortfolioTimestampsNonFatal,
} from '../../modules/vip-users/processing.js';
import { SupabaseFetcher } from '../../modules/vip-users/supabaseFetcher.js';
import { captureBackgroundException } from '../../observability/sentry.js';
import type {
  PortfolioItemSnapshotInsert,
  WalletBalanceSnapshotInsert,
} from '../../types/database.js';
import type {
  ETLJob,
  ProcessUserResult,
  VipUserWithActivity,
} from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { createCompositeHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';
import { WalletBalanceTransformer } from './balanceTransformer.js';
import { WalletBalanceWriter } from './balanceWriter.js';
import { DeBankFetcher, type DeBankTokenBalance } from './fetcher.js';
import {
  createMergedFetchResult,
  createWalletLoadCallback,
  createWalletTransformCallback,
  type WalletETLRecord,
} from './helpers.js';
import { DeBankPortfolioTransformer } from './portfolioTransformer.js';
import { PortfolioItemWriter } from './portfolioWriter.js';

interface WalletBatchFetchResult {
  walletBalances: WalletBalanceSnapshotInsert[];
  portfolioItems: PortfolioItemSnapshotInsert[];
  successfulWallets: string[];
  errors: string[];
}

/**
 * ETL processor for wallet balance data and portfolio items from DeBank
 */
export class WalletBalanceETLProcessor implements BaseETLProcessor {
  private readonly debankFetcher: DeBankFetcher;
  private readonly supabaseFetcher: SupabaseFetcher;
  private readonly transformer: WalletBalanceTransformer;
  private readonly writer: WalletBalanceWriter;
  private readonly portfolioTransformer: DeBankPortfolioTransformer;
  private readonly portfolioWriter: PortfolioItemWriter;

  constructor() {
    this.debankFetcher = new DeBankFetcher();
    this.supabaseFetcher = new SupabaseFetcher();
    this.transformer = new WalletBalanceTransformer();
    this.writer = new WalletBalanceWriter();
    this.portfolioTransformer = new DeBankPortfolioTransformer();
    this.portfolioWriter = new PortfolioItemWriter();
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    return withValidatedJob(job, 'debank', async () => {
      logger.info('Starting wallet balance + portfolio ETL job', {
        jobId: job.jobId,
      });

      const result = await this.executeWalletPipeline(job);

      logger.info('ETL job completed', {
        jobId: job.jobId,
        walletBalances: result.recordsInserted,
      });
      return result;
    });
  }

  healthCheck = createCompositeHealthCheck(() => [
    { label: 'DeBank', check: () => this.debankFetcher.healthCheck() },
    { label: 'Supabase', check: () => this.supabaseFetcher.healthCheck() },
  ]);

  getStats(): Record<string, unknown> {
    return buildRequestStats({
      debank: this.debankFetcher,
      supabase: this.supabaseFetcher,
    });
  }

  getSourceType(): string {
    return 'debank';
  }

  private async fetchData(job: ETLJob): Promise<WalletBatchFetchResult> {
    logger.info('Processing DeBank data for VIP users', { jobId: job.jobId });

    try {
      const { usersToUpdate, vipUsersTotal } =
        await fetchAndFilterVipUsersForProcessing(
          this.supabaseFetcher,
          job.jobId,
          'No VIP users found for DeBank processing',
        );
      const { walletBalances, portfolioItems, successfulWallets, errors } =
        await this.fetchUserDataBatch(usersToUpdate, job.jobId);
      await updatePortfolioTimestampsNonFatal(
        this.supabaseFetcher,
        successfulWallets,
        job.jobId,
      );

      logger.info('DeBank VIP user processing completed', {
        jobId: job.jobId,
        totalVipUsers: vipUsersTotal,
        usersScheduled: usersToUpdate.length,
        walletsProcessed: successfulWallets.length,
        walletBalanceRecords: walletBalances.length,
        portfolioItemRecords: portfolioItems.length,
      });

      return { walletBalances, portfolioItems, successfulWallets, errors };
    } catch (error) {
      logger.error('Failed to fetch DeBank data for VIP users:', {
        jobId: job.jobId,
        error,
      });
      throw error;
    }
  }

  private async fetchUserDataBatch(
    users: VipUserWithActivity[],
    jobId: string,
  ): Promise<WalletBatchFetchResult> {
    const walletBalances: WalletBalanceSnapshotInsert[] = [];
    const portfolioItems: PortfolioItemSnapshotInsert[] = [];
    const successfulWallets: string[] = [];
    const errors: string[] = [];

    for (const user of users) {
      const result = await this.processUserWallet(user, jobId);

      if (!result.success || !result.successfulWallet) {
        if (result.error) {
          errors.push(result.error);
        }
      } else {
        if (result.balances) {
          walletBalances.push(...result.balances);
        }
        if (result.portfolioItems) {
          portfolioItems.push(...result.portfolioItems);
        }
        successfulWallets.push(result.successfulWallet);
      }
    }

    if (errors.length > 0) {
      logger.warn(`Skipped ${errors.length} users due to errors`, {
        jobId,
        errors,
      });
    }

    return { walletBalances, portfolioItems, successfulWallets, errors };
  }

  private async processUserWallet(
    user: VipUserWithActivity,
    jobId: string,
  ): Promise<
    ProcessUserResult<WalletBalanceSnapshotInsert, PortfolioItemSnapshotInsert>
  > {
    const maskedWallet = maskWalletAddress(user.wallet);
    const logContext = { jobId, userId: user.user_id, wallet: maskedWallet };

    try {
      logger.debug('Processing VIP user wallet', logContext);

      const data = await this.fetchUserData(user.wallet);

      if (!data) {
        // A per-wallet fetch failure is terminal for this wallet, and the batch
        // result propagates the error after preserving other successful writes.
        const error = new Error(`Failed to fetch data for ${maskedWallet}`);
        captureBackgroundException(error, {
          component: 'job',
          tags: { failure_scope: 'wallet_user', provider: 'debank' },
          context: { jobId, userId: user.user_id, wallet: maskedWallet },
          level: 'error',
        });
        return { success: false, error: error.message };
      }

      const { tokens, protocols } = data;

      const balances = this.transformTokenData(tokens, user.wallet);
      const portfolioItems = this.portfolioTransformer.transformBatch(
        protocols,
        user.wallet,
      );

      logger.debug('User data fetched successfully', {
        jobId,
        wallet: maskedWallet,
        tokens: tokens.length,
        portfolioItems: portfolioItems.length,
      });

      return {
        success: true,
        balances,
        portfolioItems,
        successfulWallet: user.wallet,
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const errorMsg = `User ${maskedWallet}: ${errorMessage}`;
      logger.error('Failed to fetch data for user', {
        ...logContext,
        error,
      });
      captureBackgroundException(error, {
        component: 'job',
        tags: { failure_scope: 'wallet_user', provider: 'debank' },
        context: logContext,
        level: 'error',
      });
      return { success: false, error: errorMsg };
    }
  }

  private async fetchUserData(wallet: string) {
    return fetchWalletDataFromDeBank(this.debankFetcher, wallet, {
      warningMessage: 'Skipping user due to fetch failure',
    });
  }

  private transformTokenData(
    tokens: DeBankTokenBalance[],
    wallet: string,
  ): WalletBalanceSnapshotInsert[] {
    return mapTokenBalancesToSnapshots(tokens, wallet);
  }

  private async executeWalletPipeline(job: ETLJob): Promise<ETLProcessResult> {
    let successfulWallets: string[] = [];
    let walletErrors: string[] = [];
    const transformData = createWalletTransformCallback(
      this.transformer,
      job.jobId,
      'DeBank VIP batch',
    );
    const loadData = createWalletLoadCallback(
      this.writer,
      this.portfolioWriter,
      job.jobId,
      'DeBank VIP batch',
      () => successfulWallets,
    );

    const result = await executeETLFlow<WalletETLRecord, WalletETLRecord>(
      job,
      'debank',
      async () => {
        const data = await this.fetchData(job);
        successfulWallets = data.successfulWallets;
        walletErrors = data.errors;
        return createMergedFetchResult(
          data.walletBalances,
          data.portfolioItems,
        );
      },
      transformData,
      loadData,
      {
        allowEmptyFetch: true,
        allowEmptyTransform: true,
      },
    );

    if (walletErrors.length > 0) {
      result.errors.push(...walletErrors);
      result.success = false;
    }

    this.failOnSilentEmptyBatch(job, result, successfulWallets);

    return result;
  }

  /**
   * A VIP batch that fetched wallets and wrote nothing is DeBank answering 200
   * with an empty body, not a day on which every VIP wallet emptied out.
   *
   * Per-wallet success stays untouched on purpose: the writers must still see
   * every fetched wallet so an emptied slice is deleted rather than left stale.
   * The assertion belongs here, where the whole batch is visible — this is the
   * signal whose absence hid a four-day gap in `analytics.daily_wallet_tokens`
   * behind `success: true, errors: 0`.
   *
   * `recordsProcessed` is the merged raw fetch, so this fires only when the
   * provider itself returned nothing. A batch that fetched rows and then lost
   * them in transformation is a different fault and keeps its own warning.
   */
  private failOnSilentEmptyBatch(
    job: ETLJob,
    result: ETLProcessResult,
    successfulWallets: string[],
  ): void {
    if (successfulWallets.length === 0 || result.recordsProcessed > 0) {
      return;
    }

    const message =
      `DeBank returned no tokens and no positions for all ` +
      `${successfulWallets.length} fetched VIP wallets`;
    const error = new Error(message);
    logger.error(message, {
      jobId: job.jobId,
      walletsFetched: successfulWallets.length,
    });
    captureBackgroundException(error, {
      component: 'job',
      tags: { failure_scope: 'wallet_batch', provider: 'debank' },
      context: {
        jobId: job.jobId,
        walletsFetched: successfulWallets.length,
      },
      level: 'error',
    });
    result.errors.push(message);
    result.success = false;
  }
}
