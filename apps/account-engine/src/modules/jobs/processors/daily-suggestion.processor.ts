import { Logger } from '../../../common/logger';
import { AnalyticsClientService } from '../../notifications/analytics-client/client';
import type { DailySuggestionSubset } from '../../notifications/analytics-client/daily-suggestion.schema';
import { TelegramService } from '../../notifications/telegram.service';
import {
  createJobFailureResult,
  type DailySuggestionBatchPayload,
  type DailySuggestionSinglePayload,
  type Job,
  type JobProcessingResult,
  type JobProcessor,
  JobType,
  LogLevel,
} from '../interfaces/job.interface';
import { JobQueueService } from '../job-queue.service';
import { BatchFanoutHelper } from '../utils/batch-fanout.helper';

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
      if (job.type === JobType.DAILY_SUGGESTION_BATCH)
        return this.processBatch(job);
      if (job.type === JobType.DAILY_SUGGESTION_SINGLE)
        return await this.processSingle(job);
      throw new Error(`Unsupported job type: ${String(job.type)}`);
    } catch (error) {
      this.logger.error(`Daily suggestion job ${job.id} failed`, error);
      const failure = createJobFailureResult(error);
      return failure;
    }
  }

  private processBatch(job: Job): JobProcessingResult {
    const payload = job.payload as DailySuggestionBatchPayload;
    if (!Array.isArray(payload.userIds) || payload.userIds.length === 0) {
      return createJobFailureResult(
        new Error('Daily suggestion batch requires at least one userId'),
      );
    }
    return this.batchFanoutHelper.fanOutBatch(
      job,
      payload.userIds,
      JobType.DAILY_SUGGESTION_SINGLE,
      (userId): DailySuggestionSinglePayload => ({ userId }),
    );
  }

  private async processSingle(job: Job): Promise<JobProcessingResult> {
    const userId = job.payload['userId'] as string;
    this.jobQueueService.logJobEvent(
      job.id,
      LogLevel.INFO,
      `Processing daily suggestion for user ${userId}`,
    );
    try {
      const suggestion =
        await this.analyticsClientService.getDailySuggestion(userId);
      if (suggestion.action.status !== 'action_required') {
        const skipReason =
          suggestion.action.status === 'blocked'
            ? 'blocked_no_action'
            : 'no_action';
        this.jobQueueService.logJobEvent(
          job.id,
          LogLevel.INFO,
          `Skipped daily suggestion notification for user ${userId}: ${skipReason}`,
        );
        return {
          success: true,
          metadata: this.metadata(userId, suggestion, false, skipReason),
        };
      }
      await this.telegramService.sendDailySuggestion(userId, suggestion);
      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Successfully sent daily suggestion to user ${userId}`,
      );
      return {
        success: true,
        metadata: this.metadata(userId, suggestion, true),
      };
    } catch (error) {
      const skipped = this.batchFanoutHelper.handleSkippableError(
        job.id,
        userId,
        error,
      );
      if (skipped) return skipped;
      throw error;
    }
  }

  private metadata(
    userId: string,
    data: DailySuggestionSubset,
    notificationSent: boolean,
    skipReason?: string,
  ): Record<string, unknown> {
    return {
      userId,
      actionStatus: data.action.status,
      actionRequired: data.action.status === 'action_required',
      notificationSent,
      regime: data.context.signal.regime,
      ...(skipReason ? { skipped: true, skipReason } : {}),
    };
  }
}
