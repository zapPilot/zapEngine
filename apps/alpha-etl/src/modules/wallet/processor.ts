import {
  type BaseETLProcessor,
  type ETLProcessResult,
  executeETLFlow,
  withValidatedJob,
} from '../../core/processors/baseETLProcessor.js';
import { buildRequestStats } from '../../modules/core/processorStats.js';
import {
  buildUserResourceUsageRows,
  recordUserResourceUsageNonFatal,
} from '../../modules/user-service/attribution.js';
import {
  buildSourceRefreshRecords,
  recordSourceRefreshOutcomeNonFatal,
  type WalletRefreshOutcome,
} from '../../modules/user-service/refreshState.js';
import {
  selectDueUsers,
  updatePortfolioTimestampsNonFatal,
} from '../../modules/user-service/selector.js';
import { SupabaseFetcher } from '../../modules/user-service/supabaseFetcher.js';
import { captureBackgroundException } from '../../observability/sentry.js';
import type {
  PortfolioItemSnapshotInsert,
  WalletBalanceSnapshotInsert,
} from '../../types/database.js';
import type {
  ETLJob,
  ETLUserCandidate,
  ProcessUserResult,
} from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { createCompositeHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';
import { WalletBalanceTransformer } from './balanceTransformer.js';
import { WalletBalanceWriter } from './balanceWriter.js';
import {
  fetchWalletDataFromDeBank,
  mapTokenBalancesToSnapshots,
} from './debank-io.js';
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
  // Every wallet the batch attempted, failures included. `errors` collapses a
  // failure into a message, which cannot say which wallet must stay due.
  outcomes: WalletRefreshOutcome[];
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
    logger.info('Processing DeBank data for due wallets', { jobId: job.jobId });

    try {
      const { usersToUpdate, candidatesTotal } = await selectDueUsers({
        fetcher: this.supabaseFetcher,
        source: 'debank',
        jobId: job.jobId,
      });
      const batch = await this.fetchUserDataBatch(usersToUpdate, job.jobId);
      const { walletBalances, portfolioItems, successfulWallets } = batch;
      // The usage ledger counts calls that actually happened, so it belongs to
      // the fetch stage. Refresh state does not: it claims data landed, which
      // only the load can answer.
      await recordUserResourceUsageNonFatal(
        this.supabaseFetcher,
        buildUserResourceUsageRows(usersToUpdate, successfulWallets, {
          provider: 'debank',
          resource: 'portfolio_refresh',
          // fetchWalletTokenList + fetchComplexProtocolList, the two calls
          // every refreshed wallet costs.
          requestCount: 2,
        }),
        job.jobId,
      );

      logger.info('DeBank wallet refresh completed', {
        jobId: job.jobId,
        candidatesTotal,
        usersScheduled: usersToUpdate.length,
        walletsProcessed: successfulWallets.length,
        walletBalanceRecords: walletBalances.length,
        portfolioItemRecords: portfolioItems.length,
      });

      return batch;
    } catch (error) {
      logger.error('Failed to fetch DeBank data for due wallets:', {
        jobId: job.jobId,
        error,
      });
      throw error;
    }
  }

  private async fetchUserDataBatch(
    users: ETLUserCandidate[],
    jobId: string,
  ): Promise<WalletBatchFetchResult> {
    const walletBalances: WalletBalanceSnapshotInsert[] = [];
    const portfolioItems: PortfolioItemSnapshotInsert[] = [];
    const successfulWallets: string[] = [];
    const errors: string[] = [];
    const outcomes: WalletRefreshOutcome[] = [];

    for (const user of users) {
      const result = await this.processUserWallet(user, jobId);
      const fetchSucceeded =
        result.success && result.successfulWallet !== undefined;

      outcomes.push({
        wallet: user.wallet,
        userId: user.userId,
        fetchSucceeded,
        ...(result.error !== undefined && { error: result.error }),
      });

      if (!fetchSucceeded) {
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
        successfulWallets.push(user.wallet);
      }
    }

    if (errors.length > 0) {
      logger.warn(`Skipped ${errors.length} users due to errors`, {
        jobId,
        errors,
      });
    }

    return {
      walletBalances,
      portfolioItems,
      successfulWallets,
      errors,
      outcomes,
    };
  }

  private async processUserWallet(
    user: ETLUserCandidate,
    jobId: string,
  ): Promise<
    ProcessUserResult<WalletBalanceSnapshotInsert, PortfolioItemSnapshotInsert>
  > {
    const maskedWallet = maskWalletAddress(user.wallet);
    const logContext = { jobId, userId: user.userId, wallet: maskedWallet };

    try {
      logger.debug('Processing due wallet', logContext);

      const data = await this.fetchUserData(user.wallet);

      if (!data) {
        // A per-wallet fetch failure is terminal for this wallet, and the batch
        // result propagates the error after preserving other successful writes.
        const error = new Error(`Failed to fetch data for ${maskedWallet}`);
        captureBackgroundException(error, {
          component: 'job',
          tags: { failure_scope: 'wallet_user', provider: 'debank' },
          context: { jobId, userId: user.userId, wallet: maskedWallet },
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
    let outcomes: WalletRefreshOutcome[] = [];
    const transformData = createWalletTransformCallback(
      this.transformer,
      job.jobId,
      'DeBank scheduled batch',
    );
    const loadData = createWalletLoadCallback(
      this.writer,
      this.portfolioWriter,
      job.jobId,
      'DeBank scheduled batch',
      () => successfulWallets,
    );

    const result = await executeETLFlow<WalletETLRecord, WalletETLRecord>(
      job,
      'debank',
      async () => {
        const data = await this.fetchData(job);
        successfulWallets = data.successfulWallets;
        walletErrors = data.errors;
        outcomes = data.outcomes;
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

    // Snapshotted before the per-wallet errors below fold into `result`.
    // `executeETLFlow` sets `success` from the write alone, and the write is the
    // only thing freshness may be derived from. Reading it after the fold would
    // let one permanently-unreachable address record every *other* wallet as
    // failed: the whole priority fleet would re-bill DeBank daily and read as
    // never refreshed while its data landed every day. A wallet's own fetch
    // failure still reaches its own record through `fetchSucceeded`, which is
    // how the Hyperliquid batch has always scoped this.
    const write = { succeeded: result.success, errors: [...result.errors] };

    if (walletErrors.length > 0) {
      result.errors.push(...walletErrors);
      result.success = false;
    }

    const silentEmpty = this.failOnSilentEmptyBatch(
      job,
      result,
      successfulWallets,
    );
    // Freshness claims the snapshot landed, which is stronger than "the flow
    // returned": a silent empty batch wrote nothing worth being fresh about,
    // and its wallets must all stay due.
    const loadSucceeded = write.succeeded && silentEmpty === null;
    const loadErrors = silentEmpty
      ? [...write.errors, silentEmpty]
      : write.errors;

    if (loadSucceeded) {
      await updatePortfolioTimestampsNonFatal(
        this.supabaseFetcher,
        successfulWallets,
        job.jobId,
      );
    }

    await recordSourceRefreshOutcomeNonFatal(
      this.supabaseFetcher,
      buildSourceRefreshRecords('debank', outcomes, {
        succeeded: loadSucceeded,
        ...(loadSucceeded ? {} : { error: loadErrors.join('; ') }),
      }),
      job.jobId,
    );

    return result;
  }

  /**
   * A scheduled batch that fetched wallets and wrote nothing is DeBank
   * answering 200 with an empty body, not a day on which every wallet emptied
   * out.
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
   *
   * Returns the message when it fires, null otherwise: refresh state has to
   * distinguish this from a batch that genuinely wrote a day's data, and the
   * wallets it holds due deserve the reason rather than a bare flag.
   */
  private failOnSilentEmptyBatch(
    job: ETLJob,
    result: ETLProcessResult,
    successfulWallets: string[],
  ): string | null {
    if (successfulWallets.length === 0 || result.recordsProcessed > 0) {
      return null;
    }

    const message =
      `DeBank returned no tokens and no positions for all ` +
      `${successfulWallets.length} fetched wallets`;
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
    return message;
  }
}
