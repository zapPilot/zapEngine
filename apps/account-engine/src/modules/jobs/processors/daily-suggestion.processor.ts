import { Logger } from '../../../common/logger';
import { AnalyticsClientService } from '../../notifications/analytics-client.service';
import { DailySuggestionData } from '../../notifications/interfaces/daily-suggestion.interface';
import { TelegramService } from '../../notifications/telegram.service';
import {
  createJobFailureResult,
  DailySuggestionBatchPayload,
  DailySuggestionSinglePayload,
  Job,
  JobProcessingResult,
  JobProcessor,
  JobType,
  LogLevel,
} from '../interfaces/job.interface';
import { JobQueueService } from '../job-queue.service';
import { BatchFanoutHelper } from '../utils/batch-fanout.helper';

/**
 * Processor for daily suggestion Telegram notification jobs.
 *
 * Handles two job types:
 * - DAILY_SUGGESTION_BATCH: Fans out to one DAILY_SUGGESTION_SINGLE per userId
 * - DAILY_SUGGESTION_SINGLE: Fetches suggestion from analytics-engine, sends via Telegram
 */
export class DailySuggestionProcessor implements JobProcessor {
  private readonly logger = new Logger(DailySuggestionProcessor.name);

  readonly supportedJobTypes = [
    JobType.DAILY_SUGGESTION_BATCH,
    JobType.DAILY_SUGGESTION_SINGLE,
  ];

  private readonly batchFanoutHelper: BatchFanoutHelper;

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly analyticsClientService: AnalyticsClientService,
    private readonly telegramService: TelegramService,
  ) {
    this.batchFanoutHelper = new BatchFanoutHelper(
      jobQueueService,
      this.logger,
    );
  }

  async process(job: Job): Promise<JobProcessingResult> {
    try {
      if (job.type === JobType.DAILY_SUGGESTION_BATCH) {
        return this.processBatch(job);
      }
      if (job.type === JobType.DAILY_SUGGESTION_SINGLE) {
        return await this.processSingle(job);
      }
      throw new Error(`Unsupported job type: ${String(job.type)}`);
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}`, error);
      return createJobFailureResult(error);
    }
  }

  /**
   * Fan out batch job into one single-user job per userId.
   * When userIds is empty/undefined, auto-discovers all Telegram-connected users.
   */
  private async processBatch(job: Job): Promise<JobProcessingResult> {
    const payload: DailySuggestionBatchPayload = {
      userIds: job.payload['userIds'] as string[] | undefined,
    };
    let userIds = payload.userIds;

    if (!userIds || userIds.length === 0) {
      this.logger.log('No userIds provided — auto-discovering Telegram users');
      userIds = await this.telegramService.getTelegramConnectedUserIds();

      if (userIds.length === 0) {
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.WARN,
          'No Telegram-connected users found',
        );
        return { success: true, metadata: { totalUsers: 0 } };
      }
    }

    return this.batchFanoutHelper.fanOutBatch(
      job,
      userIds,
      JobType.DAILY_SUGGESTION_SINGLE,
      (userId) => ({ userId }) as Record<string, unknown>,
    );
  }

  /**
   * Fetch daily suggestion and send Telegram notification for a single user.
   */
  private async processSingle(job: Job): Promise<JobProcessingResult> {
    const payload: DailySuggestionSinglePayload = {
      userId: job.payload['userId'] as string,
    };

    this.jobQueueService.logJobEvent(
      job.id,
      LogLevel.INFO,
      `Processing daily suggestion for user ${payload.userId}`,
    );

    try {
      // Fetch daily suggestion from analytics engine
      const suggestionData =
        await this.analyticsClientService.getDailySuggestion(payload.userId);
      const actionRequired = this.shouldSendDailySuggestion(suggestionData);

      if (!actionRequired) {
        const skipReason = this.getDailySuggestionSkipReason(suggestionData);
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.INFO,
          `Skipped daily suggestion notification for user ${payload.userId}: ${skipReason}`,
        );

        return {
          success: true,
          metadata: {
            userId: payload.userId,
            strategyStance: suggestionData.context.strategy.stance,
            actionStatus: suggestionData.action.status,
            actionRequired,
            notificationSent: false,
            regime: suggestionData.context.signal.regime,
            skipped: true,
            skipReason,
          },
        };
      }

      // Send via Telegram (handles missing chat_id gracefully)
      await this.telegramService.sendDailySuggestion(
        payload.userId,
        suggestionData,
      );

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Successfully sent daily suggestion to user ${payload.userId}`,
      );

      return {
        success: true,
        metadata: {
          userId: payload.userId,
          strategyStance: suggestionData.context.strategy.stance,
          actionStatus: suggestionData.action.status,
          actionRequired,
          notificationSent: true,
          regime: suggestionData.context.signal.regime,
        },
      };
    } catch (error) {
      // Portfolio not found is expected for new users — skip gracefully
      const skippedResult = this.batchFanoutHelper.handleSkippableError(
        job.id,
        payload.userId,
        error,
      );
      if (skippedResult) {
        return skippedResult;
      }

      this.logger.error(
        `Failed to process daily suggestion for user ${payload.userId}`,
        error,
      );

      throw error;
    }
  }

  private shouldSendDailySuggestion(data: DailySuggestionData): boolean {
    return data.action.required;
  }

  private getDailySuggestionSkipReason(data: DailySuggestionData): string {
    if (data.action.status === 'blocked') {
      return 'blocked_no_action';
    }

    return 'no_action';
  }
}
