import { JOB_CONFIG } from '../../../common/constants';
import { Logger } from '../../../common/logger';
import { getErrorMessage } from '../../../common/utils';
import { PortfolioNotFoundError } from '../../notifications/errors/portfolio-not-found.error';
import {
  createBatchResult,
  Job,
  JobProcessingResult,
  JobStatus,
  JobType,
  LogLevel,
} from '../interfaces/job.interface';
import type { JobQueueService } from '../job-queue.service';

/**
 * Helper for batch-to-single job fan-out pattern
 * Eliminates duplication in WeeklyReportProcessor and DailySuggestionProcessor
 */
export class BatchFanoutHelper {
  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly logger: Logger,
  ) {}

  /**
   * Fan out batch job into individual single-user jobs
   * @param parentJob The batch job
   * @param userIds User IDs to process (or undefined to skip auto-discovery)
   * @param jobType The job type for child jobs
   * @param payloadBuilder Builds the payload for each child job
   * @returns JobProcessingResult with batch summary
   */
  fanOutBatch(
    parentJob: Job,
    userIds: string[],
    jobType: JobType,
    payloadBuilder: (userId: string) => Record<string, unknown>,
    onFanoutStart?: (totalUsers: number) => void,
  ): JobProcessingResult {
    const createdJobs: string[] = [];
    const failedJobs: string[] = [];

    if (onFanoutStart) {
      onFanoutStart(userIds.length);
    }

    for (const userId of userIds) {
      try {
        const childJob = this.jobQueueService.createJob({
          type: jobType,
          payload: payloadBuilder(userId),
          priority: parentJob.priority,
          maxRetries: JOB_CONFIG.FANOUT_MAX_RETRIES,
          retryDelaySeconds: JOB_CONFIG.FANOUT_RETRY_DELAY_SECONDS,
        });

        createdJobs.push(childJob.id);

        this.jobQueueService.logJobEvent(
          parentJob.id,
          LogLevel.INFO,
          `Created child job for user ${userId}`,
          { childJobId: childJob.id, userId },
        );
      } catch (error) {
        this.logger.error(`Failed to create job for user ${userId}`, error);
        failedJobs.push(userId);

        this.jobQueueService.logJobEvent(
          parentJob.id,
          LogLevel.ERROR,
          `Failed to create job for user ${userId}`,
          {
            userId,
            error: getErrorMessage(error),
          },
        );
      }
    }

    // Store child job IDs for status aggregation
    this.jobQueueService.updateJobMetadata(parentJob.id, {
      childJobIds: createdJobs,
      totalUsers: userIds.length,
      isBatchJob: true,
    });

    this.jobQueueService.updateJobStatus(parentJob.id, JobStatus.PROCESSING);

    this.jobQueueService.logJobEvent(
      parentJob.id,
      LogLevel.INFO,
      `Batch dispatched: ${createdJobs.length}/${userIds.length} jobs created`,
      {
        totalUsers: userIds.length,
        successfulJobs: createdJobs.length,
        failedJobsCount: failedJobs.length,
      },
    );

    return createBatchResult(userIds.length, createdJobs, failedJobs);
  }

  /**
   * Handle PortfolioNotFoundError gracefully by returning skipped result
   * @param jobId The job ID for logging
   * @param userId The user ID being processed
   * @param error The error to handle
   * @param additionalContext Additional metadata to include in the response
   * @returns JobProcessingResult marking job as skipped, or rethrows if not PortfolioNotFoundError
   */
  handleSkippableError(
    jobId: string,
    userId: string,
    error: unknown,
    additionalContext?: Record<string, unknown>,
  ): JobProcessingResult | null {
    if (error instanceof PortfolioNotFoundError) {
      this.logger.warn(
        `Portfolio data not available for user ${userId}, skipping`,
      );

      this.jobQueueService.logJobEvent(
        jobId,
        LogLevel.WARN,
        `Skipped: portfolio data not available for user ${userId}`,
        {
          userId,
          skipReason: 'portfolio_not_found',
          ...additionalContext,
        },
      );

      return {
        success: true,
        metadata: {
          userId,
          skipped: true,
          skipReason: 'portfolio_not_found',
          ...additionalContext,
        },
      };
    }

    return null; // Not a skippable error
  }
}
