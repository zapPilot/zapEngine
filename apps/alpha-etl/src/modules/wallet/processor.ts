import {
  type BaseETLProcessor,
  type ETLProcessResult,
  type HealthCheckResult,
  withValidatedJob,
  executeETLFlow,
} from "../../core/processors/baseETLProcessor.js";
import { wrapCompositeHealthCheck } from "../../utils/healthCheck.js";
import {
  DeBankFetcher,
  type DeBankTokenBalance,
} from "../../modules/wallet/fetcher.js";
import {
  type WalletETLRecord,
  createMergedFetchResult,
  createWalletLoadCallback,
  createWalletTransformCallback,
} from "../../modules/wallet/helpers.js";
import { DeBankPortfolioTransformer } from "../../modules/wallet/portfolioTransformer.js";
import { WalletBalanceTransformer } from "../../modules/wallet/balanceTransformer.js";
import { PortfolioItemWriter } from "../../modules/wallet/portfolioWriter.js";
import { WalletBalanceWriter } from "../../modules/wallet/balanceWriter.js";
import {
  fetchAndFilterVipUsersForProcessing,
  updatePortfolioTimestampsNonFatal,
} from "../../modules/vip-users/processing.js";
import { SupabaseFetcher } from "../../modules/vip-users/supabaseFetcher.js";
import type {
  ProcessUserResult,
  ETLJob,
  VipUserWithActivity,
} from "../../types/index.js";
import type {
  PortfolioItemSnapshotInsert,
  WalletBalanceSnapshotInsert,
} from "../../types/database.js";
import { toErrorMessage } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { maskWalletAddress } from "../../utils/mask.js";
import {
  fetchWalletDataFromDeBank,
  mapTokenBalancesToSnapshots,
} from "../../modules/vip-users/common.js";

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
    return withValidatedJob(job, "debank", async () => {
      logger.info("Starting wallet balance + portfolio ETL job", {
        jobId: job.jobId,
      });

      const result = await this.executeWalletPipeline(job);

      logger.info("ETL job completed", {
        jobId: job.jobId,
        walletBalances: result.recordsInserted,
      });
      return result;
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapCompositeHealthCheck([
      { label: "DeBank", check: () => this.debankFetcher.healthCheck() },
      { label: "Supabase", check: () => this.supabaseFetcher.healthCheck() },
    ]);
  }

  getStats(): Record<string, unknown> {
    return {
      debank: this.debankFetcher.getRequestStats(),
      supabase: this.supabaseFetcher.getRequestStats(),
    };
  }

  getSourceType(): string {
    return "debank";
  }

  private async fetchData(job: ETLJob): Promise<{
    walletBalances: WalletBalanceSnapshotInsert[];
    portfolioItems: PortfolioItemSnapshotInsert[];
  }> {
    logger.info("Processing DeBank data for VIP users", { jobId: job.jobId });

    try {
      const { usersToUpdate, vipUsersTotal, costSavingsPercent } =
        await fetchAndFilterVipUsersForProcessing(
          this.supabaseFetcher,
          job.jobId,
          "No VIP users found for DeBank processing",
        );
      const { walletBalances, portfolioItems, successfulWallets } =
        await this.fetchUserDataBatch(usersToUpdate, job.jobId);
      await updatePortfolioTimestampsNonFatal(
        this.supabaseFetcher,
        successfulWallets,
        job.jobId,
      );

      logger.info("DeBank VIP user processing completed", {
        jobId: job.jobId,
        totalVipUsers: vipUsersTotal,
        usersScheduled: usersToUpdate.length,
        walletsProcessed: successfulWallets.length,
        walletBalanceRecords: walletBalances.length,
        portfolioItemRecords: portfolioItems.length,
        costSavingsPercent: `${costSavingsPercent}%`,
      });

      return { walletBalances, portfolioItems };
    } catch (error) {
      logger.error("Failed to fetch DeBank data for VIP users:", {
        jobId: job.jobId,
        error,
      });
      throw error;
    }
  }

  private async fetchUserDataBatch(
    users: VipUserWithActivity[],
    jobId: string,
  ): Promise<{
    walletBalances: WalletBalanceSnapshotInsert[];
    portfolioItems: PortfolioItemSnapshotInsert[];
    successfulWallets: string[];
  }> {
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

    return { walletBalances, portfolioItems, successfulWallets };
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
      logger.debug("Processing VIP user wallet", logContext);

      const data = await this.fetchUserData(user.wallet);

      if (!data) {
        // Logged in fetchUserData
        return {
          success: false,
          error: `Failed to fetch data for ${maskedWallet}`,
        };
      }

      const { tokens, protocols } = data;

      const balances = this.transformTokenData(tokens, user.wallet);
      const portfolioItems = this.portfolioTransformer.transformBatch(
        protocols,
        user.wallet,
      );

      logger.debug("User data fetched successfully", {
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
      logger.error("Failed to fetch data for user", {
        ...logContext,
        error,
      });
      return { success: false, error: errorMsg };
    }
  }

  private async fetchUserData(wallet: string) {
    return fetchWalletDataFromDeBank(this.debankFetcher, wallet, {
      warningMessage: "Skipping user due to fetch failure",
    });
  }

  private transformTokenData(
    tokens: DeBankTokenBalance[],
    wallet: string,
  ): WalletBalanceSnapshotInsert[] {
    return mapTokenBalancesToSnapshots(tokens, wallet);
  }

  private async executeWalletPipeline(job: ETLJob): Promise<ETLProcessResult> {
    const transformData = createWalletTransformCallback(
      this.transformer,
      job.jobId,
      "DeBank VIP batch",
    );
    const loadData = createWalletLoadCallback(
      this.writer,
      this.portfolioWriter,
      job.jobId,
      "DeBank VIP batch",
    );

    return executeETLFlow<WalletETLRecord, WalletETLRecord>(
      job,
      "debank",
      this.fetchWalletBatch.bind(this, job),
      transformData,
      loadData,
      {
        allowEmptyFetch: true,
        allowEmptyTransform: true,
      },
    );
  }

  private async fetchWalletBatch(job: ETLJob): Promise<WalletETLRecord[]> {
    const { walletBalances, portfolioItems } = await this.fetchData(job);
    return createMergedFetchResult(walletBalances, portfolioItems);
  }
}
