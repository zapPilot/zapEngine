import { JOB_CONFIG } from '@common/constants';
import { ServiceLayerException } from '@common/exceptions';
import { HttpStatus } from '@common/http';
import { Logger } from '@common/logger';
import { getErrorMessage } from '@common/utils';

import { AdminNotificationService } from '../notifications/admin-notification.service';
import {
  Job,
  JobProcessingResult,
  JobProcessor,
  JobStatus,
  JobType,
  LogLevel,
} from './interfaces/job.interface';
import { JobQueueService } from './job-queue.service';

const NON_RETRYABLE_ERRORS = [
  'ValidationError',
  'AuthenticationError',
  'AuthorizationError',
  'NotFoundError',
] as const;

/**
 * Service for processing background jobs with retry logic and error handling
 */
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);
  private readonly processors = new Map<JobType, JobProcessor>();
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;
  private readonly processingIntervalMs = JOB_CONFIG.PROCESSING_INTERVAL_MS;
  private readonly maxConcurrentJobs = JOB_CONFIG.MAX_CONCURRENT_JOBS;
  private activeJobs = new Set<string>();

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly adminNotificationService: AdminNotificationService,
  ) {}

  /**
   * Initialize the job processor
   */
  /**
   * Register a job processor for specific job types
   */
  registerProcessor(processor: JobProcessor): void {
    for (const jobType of processor.supportedJobTypes) {
      if (this.processors.has(jobType)) {
        this.logger.warn(
          `Processor for job type ${jobType} already registered, overwriting`,
        );
      }
      this.processors.set(jobType, processor);
      this.logger.log(`Registered processor for job type: ${jobType}`);
    }
  }

  /**
   * Unregister a job processor
   */
  unregisterProcessor(jobType: JobType): void {
    if (this.processors.delete(jobType)) {
      this.logger.log(`Unregistered processor for job type: ${jobType}`);
    }
  }

  /**
   * Start background job processing
   */
  startProcessing(): void {
    if (this.isProcessing) {
      this.logger.warn('Job processing already started');
      return;
    }

    this.isProcessing = true;
    this.logger.log(
      `Starting job processing with ${this.processingIntervalMs}ms interval`,
    );

    this.processingInterval = setInterval(() => {
      try {
        this.processAvailableJobs();
      } /* istanbul ignore next -- processAvailableJobs handles its own errors internally */ catch (error) {
        this.logger.error('Error in job processing cycle', error);
      }
    }, this.processingIntervalMs);
  }

  /**
   * Stop background job processing
   */
  stopProcessing(): void {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    this.logger.log('Stopped job processing');
  }

  start(): void {
    this.logger.log('Initializing job processor service');
    this.startProcessing();
  }

  stop(): void {
    this.logger.log('Shutting down job processor service');
    this.stopProcessing();
  }

  /**
   * Process a single job immediately (useful for testing)
   */
  async processJob(jobId: string): Promise<JobProcessingResult> {
    const job = this.jobQueueService.getJob(jobId);
    if (!job) {
      throw new ServiceLayerException(
        `Job ${jobId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    if (job.status !== JobStatus.PENDING) {
      throw new ServiceLayerException(
        `Job ${jobId} is not in pending status (current: ${job.status})`,
        HttpStatus.CONFLICT,
      );
    }

    return this.executeJob(job);
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    isProcessing: boolean;
    activeJobs: number;
    maxConcurrentJobs: number;
    registeredProcessors: JobType[];
  } {
    return {
      isProcessing: this.isProcessing,
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      registeredProcessors: Array.from(this.processors.keys()),
    };
  }

  /**
   * Process available jobs up to the concurrency limit
   */
  private processAvailableJobs(): void {
    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      return; // Already at max capacity
    }

    const availableSlots = this.maxConcurrentJobs - this.activeJobs.size;

    for (let i = 0; i < availableSlots; i++) {
      try {
        const job = this.jobQueueService.getNextJob();
        if (!job) {
          break; // No more jobs available
        }

        this.executeJobInBackground(job);
      } catch (error) {
        this.logger.error('Error getting next job', error);
        break;
      }
    }
  }

  /**
   * Execute a single job with error handling and retry logic
   */
  private async executeJob(job: Job): Promise<JobProcessingResult> {
    const jobId = job.id;
    this.activeJobs.add(jobId);

    try {
      const processor = this.resolveProcessor(job);
      if (!processor) {
        return {
          success: false,
          error: `No processor registered for job type: ${job.type}`,
        };
      }

      // Mark job as processing
      this.jobQueueService.startProcessing(jobId);
      this.jobQueueService.logJobEvent(
        jobId,
        LogLevel.INFO,
        'Started processing job',
      );

      this.logger.log(`Processing job ${jobId} of type ${job.type}`);

      // Execute the job
      const result = await processor.process(job);
      this.handleJobResult(job, result);

      // Cleanup if processor supports it
      if (processor.cleanup) {
        try {
          await processor.cleanup(job, result);
        } catch (cleanupError) {
          this.logger.warn(`Cleanup failed for job ${jobId}`, cleanupError);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Error executing job ${jobId}`, error);
      this.handleJobFailure(
        job,
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        success: false,
        error: getErrorMessage(error),
      };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Resolve the processor for a job type, failing the job if none is registered
   */
  private resolveProcessor(job: Job): JobProcessor | null {
    const processor = this.processors.get(job.type);
    if (processor) {
      return processor;
    }

    const availableTypes = Array.from(this.processors.keys()).join(', ');
    const error = `No processor registered for job type: ${job.type}. Available types: ${availableTypes}`;
    this.logger.error(error);

    this.jobQueueService.failJob(job.id, error);
    this.jobQueueService.logJobEvent(job.id, LogLevel.ERROR, error);

    return null;
  }

  /**
   * Handle the result of a processed job (success or failure branching)
   */
  private handleJobResult(job: Job, result: JobProcessingResult): void {
    const jobId = job.id;

    if (!result.success) {
      const error = new Error(result.error ?? 'Job processing failed');
      this.handleJobFailure(job, error);
      return;
    }

    if (result.metadata?.batchStatus === 'processing') {
      this.jobQueueService.logJobEvent(
        jobId,
        LogLevel.INFO,
        'Batch job dispatched successfully, now processing children',
        result.metadata,
      );
      this.logger.log(
        `Batch job ${jobId} dispatched successfully, processing children`,
      );
    } else {
      this.jobQueueService.completeJob(jobId);
      this.jobQueueService.logJobEvent(
        jobId,
        LogLevel.INFO,
        'Job completed successfully',
        result.metadata,
      );
      this.logger.log(`Job ${jobId} completed successfully`);
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private handleJobFailure(job: Job, error: Error): void {
    const nextAttempt = job.retryCount + 1;
    const shouldRetry = this.shouldRetry(error, nextAttempt, job.maxRetries);
    const errorMessage = error.message || 'Unknown error';

    if (shouldRetry) {
      this.scheduleRetry(job, errorMessage, nextAttempt);
      return;
    }

    this.failJobPermanently(job, errorMessage);
  }

  private scheduleRetry(
    job: Job,
    errorMessage: string,
    nextAttempt: number,
  ): void {
    this.jobQueueService.retryJob(job.id, errorMessage);
    this.jobQueueService.logJobEvent(
      job.id,
      LogLevel.WARN,
      `Job failed, scheduling retry (attempt ${nextAttempt}/${job.maxRetries})`,
      { error: errorMessage, retryCount: nextAttempt },
    );

    this.logger.warn(
      `Job ${job.id} failed, scheduling retry (attempt ${nextAttempt}/${job.maxRetries}): ${errorMessage}`,
    );
  }

  private failJobPermanently(job: Job, errorMessage: string): void {
    this.jobQueueService.failJob(job.id, errorMessage);
    this.jobQueueService.logJobEvent(
      job.id,
      LogLevel.ERROR,
      `Job failed permanently after ${job.retryCount} retries`,
      { error: errorMessage, finalFailure: true },
    );

    this.logger.error(
      `Job ${job.id} failed permanently after ${job.retryCount} retries: ${errorMessage}`,
    );

    const failedJob = this.jobQueueService.getJob(job.id);
    if (failedJob) {
      this.notifyAdminOfJobFailure(failedJob);
    }
  }

  /**
   * Execute a job asynchronously without blocking the processing loop
   */
  private executeJobInBackground(job: Job): void {
    void (async () => {
      try {
        await this.executeJob(job);
      } catch (error) {
        this.logger.error(`Failed to execute job ${job.id}`, error);
      }
    })();
  }

  /**
   * Send admin notification for a permanently failed job (fire-and-forget)
   */
  private notifyAdminOfJobFailure(job: Job): void {
    void (async () => {
      try {
        await this.adminNotificationService.notifyJobFailure(job);
      } catch (err) {
        this.logger.error(
          'Failed to send admin notification',
          getErrorMessage(err),
        );
      }
    })();
  }

  private shouldRetry(
    error: Error,
    attempt: number,
    maxRetries: number,
  ): boolean {
    if (attempt >= maxRetries) {
      return false;
    }

    return !NON_RETRYABLE_ERRORS.some(
      (errorType) =>
        error.constructor.name === errorType ||
        error.message.includes(errorType),
    );
  }
}
