import {
  createEmptyWriteResult,
  type WriteResult,
} from '../../core/database/baseWriter.js';
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
import { selectDueUsers } from '../../modules/user-service/selector.js';
import { SupabaseFetcher } from '../../modules/user-service/supabaseFetcher.js';
import { PortfolioItemWriter } from '../../modules/wallet/portfolioWriter.js';
import type {
  HyperliquidVaultAprSnapshotInsert,
  PortfolioItemSnapshotInsert,
} from '../../types/database.js';
import type { ETLJob, ETLUserCandidate } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { createCompositeHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import { maskWalletAddress } from '../../utils/mask.js';
import { HyperliquidVaultAprWriter } from './aprWriter.js';
import { HyperliquidFetcher } from './fetcher.js';
import {
  collectUserTransformResult,
  type HyperliquidProcessSummary,
  type HyperliquidTransformBatch,
  type HyperliquidUserTransformResult,
  toWalletRefreshOutcome,
  updateProcessSummary,
} from './processor.helpers.js';
import { HyperliquidDataTransformer } from './transformer.js';

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
    return 'hyperliquid';
  }

  async process(job: ETLJob): Promise<ETLProcessResult> {
    const summary: HyperliquidProcessSummary = {
      usersProcessed: 0,
      positionsTransformed: 0,
      aprSnapshots: 0,
    };

    return withValidatedJob(job, 'hyperliquid', async () => {
      logger.info('Processing Hyperliquid vault data', { jobId: job.jobId });

      const result = await this.executeProcessFlow(job, summary);

      logger.info('Hyperliquid processing completed', {
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
    return executeETLFlow<ETLUserCandidate, HyperliquidTransformBatch>(
      job,
      'hyperliquid',
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

  private async fetchUsersToUpdate(jobId: string): Promise<ETLUserCandidate[]> {
    const { usersToUpdate } = await selectDueUsers({
      fetcher: this.supabaseFetcher,
      source: 'hyperliquid',
      jobId,
    });
    return usersToUpdate;
  }

  private async transformUsers(
    usersToUpdate: ETLUserCandidate[],
    jobId: string,
  ): Promise<HyperliquidTransformBatch> {
    const positionRecords: PortfolioItemSnapshotInsert[] = [];
    const aprSnapshotsByVault = new Map<
      string,
      HyperliquidVaultAprSnapshotInsert
    >();
    const successfulWallets: string[] = [];
    const errors: string[] = [];
    const outcomes: WalletRefreshOutcome[] = [];
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
      outcomes.push(toWalletRefreshOutcome(user, userResult));
      if (hadError) {
        success = false;
      }
    }

    // The vault fetch is the ETL flow's transform stage, so this is the only
    // point where the wallets that actually cost a Hyperliquid call are known.
    await recordUserResourceUsageNonFatal(
      this.supabaseFetcher,
      buildUserResourceUsageRows(usersToUpdate, successfulWallets, {
        provider: 'hyperliquid',
        resource: 'vault_details',
        // One getVaultDetails call per wallet.
        requestCount: 1,
      }),
      jobId,
    );

    return {
      portfolioRecords: positionRecords,
      aprRecords: Array.from(aprSnapshotsByVault.values()),
      successfulWallets,
      errors,
      success,
      outcomes,
    };
  }

  private async processUser(
    user: ETLUserCandidate,
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
          ...(transformedPosition && { positionRecord: transformedPosition }),
          aprSnapshot,
        };
      } catch (aprError) {
        const message = toErrorMessage(aprError);
        logger.error('Hyperliquid APR transformation failed', {
          jobId,
          vault: aprData.vaultAddress,
          error: message,
        });
        return {
          successfulWallet: user.wallet,
          ...(transformedPosition && { positionRecord: transformedPosition }),
          errorMessage: message,
        };
      }
    } catch (error) {
      const message = toErrorMessage(error);
      logger.error('Failed to process Hyperliquid vault for user', {
        jobId,
        userId: user.userId,
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

    const portfolioResult = await this.writePortfolioRecords(
      batch.portfolioRecords,
      batch.successfulWallets,
    );
    const aprResult = await this.writeAprRecords(batch.aprRecords);
    // The writers alone, not the merged `success` below: that one ands in the
    // per-wallet fetch errors, which each outcome already carries, and would
    // hold a wallet whose position landed due on another wallet's outage.
    const loadSucceeded = portfolioResult.success && aprResult.success;

    await recordSourceRefreshOutcomeNonFatal(
      this.supabaseFetcher,
      buildSourceRefreshRecords('hyperliquid', batch.outcomes, {
        succeeded: loadSucceeded,
        ...(loadSucceeded
          ? {}
          : {
              error: [...portfolioResult.errors, ...aprResult.errors].join(
                '; ',
              ),
            }),
      }),
      jobId,
    );

    return {
      success: batch.success && loadSucceeded,
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
    successfulWallets: string[],
  ): Promise<WriteResult> {
    if (records.length === 0 && successfulWallets.length === 0) {
      return createEmptyWriteResult();
    }

    const result = await this.portfolioWriter.writeSnapshots(
      records,
      'hyperliquid',
      successfulWallets,
    );
    return records.length === 0 ? { ...result, recordsInserted: 0 } : result;
  }

  private async writeAprRecords(
    records: HyperliquidVaultAprSnapshotInsert[],
  ): Promise<WriteResult> {
    if (records.length === 0) {
      return createEmptyWriteResult();
    }

    return this.aprWriter.writeSnapshots(records);
  }

  getStats(): Record<string, unknown> {
    return buildRequestStats({
      hyperliquid: this.hyperliquidFetcher,
      supabase: this.supabaseFetcher,
    });
  }

  healthCheck = createCompositeHealthCheck(() => [
    {
      label: 'Hyperliquid',
      check: () => this.hyperliquidFetcher.healthCheck(),
    },
    { label: 'Supabase', check: () => this.supabaseFetcher.healthCheck() },
  ]);
}
