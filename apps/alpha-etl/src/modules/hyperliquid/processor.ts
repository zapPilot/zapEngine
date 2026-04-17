import {
  type BaseETLProcessor,
  type ETLProcessResult,
  type HealthCheckResult,
  withValidatedJob,
  executeETLFlow,
} from "../../core/processors/baseETLProcessor.js";
import { wrapCompositeHealthCheck } from "../../utils/healthCheck.js";
import { HyperliquidFetcher } from "../../modules/hyperliquid/fetcher.js";
import {
  type HyperliquidProcessSummary,
  type HyperliquidTransformBatch,
  type HyperliquidUserTransformResult,
  collectUserTransformResult,
  updateProcessSummary,
} from "../../modules/hyperliquid/processor.helpers.js";
import {
  createEmptyWriteResult,
  type WriteResult,
} from "../../core/database/baseWriter.js";
import { HyperliquidDataTransformer } from "../../modules/hyperliquid/transformer.js";
import {
  fetchAndFilterVipUsersForProcessing,
  updatePortfolioTimestampsNonFatal,
} from "../../modules/vip-users/processing.js";
import { SupabaseFetcher } from "../../modules/vip-users/supabaseFetcher.js";
import { PortfolioItemWriter } from "../../modules/wallet/portfolioWriter.js";
import type { ETLJob, VipUserWithActivity } from "../../types/index.js";
import type {
  HyperliquidVaultAprSnapshotInsert,
  PortfolioItemSnapshotInsert,
} from "../../types/database.js";
import { toErrorMessage } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { maskWalletAddress } from "../../utils/mask.js";
import { HyperliquidVaultAprWriter } from "./aprWriter.js";

export class HyperliquidVaultETLProcessor implements BaseETLProcessor {
  private readonly hyperliquidFetcher: HyperliquidFetcher;
  private readonly supabaseFetcher: SupabaseFetcher;
  private readonly transformer: HyperliquidDataTransformer;
  private readonly aprWriter: HyperliquidVaultAprWriter;
  private readonly portfolioWriter: PortfolioItemWriter;

  constructor() {
    this.hyperliquidFetcher = new HyperliquidFetcher();
    this.supabaseFetcher = new SupabaseFetcher();
    this.transformer = new HyperliquidDataTransformer();
    this.aprWriter = new HyperliquidVaultAprWriter();
    this.portfolioWriter = new PortfolioItemWriter();
  }

  getSourceType(): string {
    return "hyperliquid";
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    const summary: HyperliquidProcessSummary = {
      usersProcessed: 0,
      positionsTransformed: 0,
      aprSnapshots: 0,
    };

    return withValidatedJob(job, "hyperliquid", async () => {
      logger.info("Processing Hyperliquid vault data", { jobId: job.jobId });

      const result = await this.executeProcessFlow(job, summary);

      logger.info("Hyperliquid processing completed", {
        jobId: job.jobId,
        usersProcessed: summary.usersProcessed,
        positionsTransformed: summary.positionsTransformed,
        aprSnapshots: summary.aprSnapshots,
        success: result.success,
      });

      return result;
    });
  }

  private async executeProcessFlow(
    job: ETLJob,
    summary: HyperliquidProcessSummary,
  ): Promise<ETLProcessResult> {
    return executeETLFlow<VipUserWithActivity, HyperliquidTransformBatch>(
      job,
      "hyperliquid",
      this.fetchUsersToUpdate.bind(this, job.jobId),
      async (usersToUpdate) => {
        const batch = await this.transformUsers(usersToUpdate, job.jobId);
        updateProcessSummary(summary, usersToUpdate.length, batch);
        return [batch];
      },
      async (transformedData) =>
        this.writeTransformedData(transformedData, job.jobId),
      {
        allowEmptyFetch: true,
        allowEmptyTransform: true,
      },
    );
  }

  private async fetchUsersToUpdate(
    jobId: string,
  ): Promise<VipUserWithActivity[]> {
    const { usersToUpdate } = await fetchAndFilterVipUsersForProcessing(
      this.supabaseFetcher,
      jobId,
      "No VIP users returned for Hyperliquid processing",
    );
    return usersToUpdate;
  }

  private async transformUsers(
    usersToUpdate: VipUserWithActivity[],
    jobId: string,
  ): Promise<HyperliquidTransformBatch> {
    const positionRecords: PortfolioItemSnapshotInsert[] = [];
    const aprSnapshotsByVault = new Map<
      string,
      HyperliquidVaultAprSnapshotInsert
    >();
    const successfulWallets: string[] = [];
    const errors: string[] = [];
    let success = true;

    for (const user of usersToUpdate) {
      const userResult = await this.processUser(user, jobId);
      const hadError = collectUserTransformResult(
        userResult,
        positionRecords,
        aprSnapshotsByVault,
        successfulWallets,
        errors,
      );
      if (hadError) {
        success = false;
      }
    }

    return {
      portfolioRecords: positionRecords,
      aprRecords: Array.from(aprSnapshotsByVault.values()),
      successfulWallets,
      errors,
      success,
    };
  }

  private async processUser(
    user: VipUserWithActivity,
    jobId: string,
  ): Promise<HyperliquidUserTransformResult> {
    try {
      const details = await this.hyperliquidFetcher.getVaultDetails(
        user.wallet,
      );
      const positionData = this.hyperliquidFetcher.extractPositionData(
        details,
        user.wallet,
      );
      const batchTimestamp = new Date().toISOString();
      const transformedPosition = this.transformer.transformPosition({
        position: positionData,
        timestamp: batchTimestamp,
      });

      const aprData = this.hyperliquidFetcher.extractAprData(details);
      try {
        const aprSnapshot = this.transformer.transformApr(aprData, details);
        return {
          successfulWallet: user.wallet,
          positionRecord: transformedPosition ?? undefined,
          aprSnapshot,
        };
      } catch (aprError) {
        const message = toErrorMessage(aprError);
        logger.error("Hyperliquid APR transformation failed", {
          jobId,
          vault: aprData.vaultAddress,
          error: message,
        });
        return {
          successfulWallet: user.wallet,
          positionRecord: transformedPosition ?? undefined,
          errorMessage: message,
        };
      }
    } catch (error) {
      const message = toErrorMessage(error);
      logger.error("Failed to process Hyperliquid vault for user", {
        jobId,
        userId: user.user_id,
        wallet: maskWalletAddress(user.wallet),
        error: message,
      });
      return { errorMessage: message };
    }
  }

  private async writeTransformedData(
    transformedData: HyperliquidTransformBatch[],
    jobId: string,
  ): Promise<WriteResult> {
    const batch = transformedData[0];
    if (!batch) {
      return createEmptyWriteResult();
    }

    await updatePortfolioTimestampsNonFatal(
      this.supabaseFetcher,
      batch.successfulWallets,
      jobId,
    );

    const portfolioResult = await this.writePortfolioRecords(
      batch.portfolioRecords,
    );
    const aprResult = await this.writeAprRecords(batch.aprRecords);

    return {
      success: batch.success && portfolioResult.success && aprResult.success,
      recordsInserted:
        portfolioResult.recordsInserted + aprResult.recordsInserted,
      duplicatesSkipped:
        (portfolioResult.duplicatesSkipped ?? 0) +
        (aprResult.duplicatesSkipped ?? 0),
      errors: [...batch.errors, ...portfolioResult.errors, ...aprResult.errors],
    };
  }

  private async writePortfolioRecords(
    records: PortfolioItemSnapshotInsert[],
  ): Promise<WriteResult> {
    if (records.length === 0) {
      return createEmptyWriteResult();
    }

    return this.portfolioWriter.writeSnapshots(records);
  }

  private async writeAprRecords(
    records: HyperliquidVaultAprSnapshotInsert[],
  ): Promise<WriteResult> {
    if (records.length === 0) {
      return createEmptyWriteResult();
    }

    return this.aprWriter.writeSnapshots(records);
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return wrapCompositeHealthCheck([
      {
        label: "Hyperliquid",
        check: () => this.hyperliquidFetcher.healthCheck(),
      },
      { label: "Supabase", check: () => this.supabaseFetcher.healthCheck() },
    ]);
  }

  getStats(): Record<string, unknown> {
    return {
      hyperliquid: this.hyperliquidFetcher.getRequestStats(),
      supabase: this.supabaseFetcher.getRequestStats(),
    };
  }
}
