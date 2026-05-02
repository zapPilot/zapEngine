import { randomUUID } from 'node:crypto';

import { JOB_CONFIG } from '../../common/constants';
import { ServiceLayerException } from '../../common/exceptions';
import { HttpStatus } from '../../common/http';
import { Logger } from '../../common/logger';
import { BackoffCalculator } from '../../common/utils';
import {
  CreateJobOptions,
  Job,
  JobQueryFilters,
  JobStatistics,
  JobStatus,
  LogLevel,
} from './interfaces/job.interface';

/**
 * In-memory job queue service for managing async job processing
 * Provides immediate 202 responses with detailed console logging
 */
export class JobQueueService {
  private readonly logger = new Logger(JobQueueService.name);
  private readonly jobs = new Map<string, Job>();
  private readonly jobLogs = new Map<string, string[]>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Clean up completed jobs every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldJobs();
    }, JOB_CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Create a new job in the queue
   */
  createJob(options: CreateJobOptions): Job {
    const {
      type,
      payload,
      priority = 0,
      maxRetries = 3,
      retryDelaySeconds = 60,
      scheduledAt = new Date(),
      metadata,
    } = options;

    const jobId = randomUUID();
    const now = new Date();

    const job: Job = {
      id: jobId,
      type,
      status: JobStatus.PENDING,
      payload,
      priority,
      maxRetries,
      retryCount: 0,
      retryDelaySeconds,
      scheduledAt,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);
    this.jobLogs.set(jobId, []);

    this.logJobEvent(
      jobId,
      LogLevel.INFO,
      `Job created with priority ${priority}`,
      { type, priority, scheduledAt: scheduledAt.toISOString() },
    );

    this.logger.log(`Created job ${jobId} of type ${type}`);
    return job;
  }

  /**
   * Get the next available job for processing
   */
  getNextJob(): Job | null {
    const now = new Date();
    const pendingJobs = Array.from(this.jobs.values())
      .filter(
        (job) => job.status === JobStatus.PENDING && job.scheduledAt <= now,
      )
      .sort((a, b) => this.compareJobsByPriorityAndSchedule(a, b));

    return pendingJobs[0] ?? null;
  }

  /**
   * Get job by ID or throw if not found
   */
  private getJobOrThrow(jobId: string): Job {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new ServiceLayerException(
        `Job ${jobId} not found`,
        HttpStatus.NOT_FOUND,
      );
    }
    return job;
  }

  /**
   * Update job status and related fields
   */
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    options?: {
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
      incrementRetryCount?: boolean;
    },
  ): Job {
    const job = this.getJobOrThrow(jobId);

    const updatedJob: Job = {
      ...job,
      status,
      updatedAt: new Date(),
    };

    if (options?.errorMessage) {
      updatedJob.errorMessage = options.errorMessage;
    }

    if (options?.startedAt) {
      updatedJob.startedAt = options.startedAt;
    }

    if (options?.completedAt) {
      updatedJob.completedAt = options.completedAt;
    }

    if (options?.incrementRetryCount) {
      updatedJob.retryCount = job.retryCount + 1;
    }

    this.jobs.set(jobId, updatedJob);

    this.logJobEvent(jobId, LogLevel.INFO, `Status changed to ${status}`, {
      status,
      errorMessage: options?.errorMessage,
    });

    this.logger.log(`Updated job ${jobId} status to ${status}`);
    return updatedJob;
  }

  /**
   * Mark job as processing
   */
  startProcessing(jobId: string): Job {
    return this.updateJobStatus(jobId, JobStatus.PROCESSING, {
      startedAt: new Date(),
    });
  }

  /**
   * Mark job as completed
   */
  completeJob(jobId: string): Job {
    return this.updateJobStatus(jobId, JobStatus.COMPLETED, {
      completedAt: new Date(),
    });
  }

  /**
   * Update job metadata
   */
  updateJobMetadata(jobId: string, metadata: Record<string, unknown>): Job {
    const job = this.getJobOrThrow(jobId);

    const updatedJob: Job = {
      ...job,
      metadata: { ...job.metadata, ...metadata },
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, updatedJob);

    this.logJobEvent(jobId, LogLevel.INFO, 'Job metadata updated', {
      metadataKeys: Object.keys(metadata),
    });

    this.logger.log(`Updated job ${jobId} metadata`);
    return updatedJob;
  }

  /**
   * Mark job as failed
   */
  failJob(jobId: string, errorMessage: string): Job {
    return this.updateJobStatus(jobId, JobStatus.FAILED, {
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Mark job for retry
   */
  retryJob(jobId: string, errorMessage: string): Job {
    const currentJob = this.getJobOrThrow(jobId);
    const newRetryCount = currentJob.retryCount + 1;

    // Schedule retry with exponential backoff (calculateDelay expects milliseconds)
    const retryDelayMs = BackoffCalculator.calculateDelay(
      newRetryCount,
      currentJob.retryDelaySeconds * 1000,
    );
    const nextScheduledAt = new Date(Date.now() + retryDelayMs);

    const retryJob: Job = {
      ...currentJob,
      status: JobStatus.PENDING,
      retryCount: newRetryCount,
      errorMessage,
      scheduledAt: nextScheduledAt,
      updatedAt: new Date(),
    };

    this.jobs.set(jobId, retryJob);

    this.logJobEvent(
      jobId,
      LogLevel.WARN,
      `Retry scheduled for ${nextScheduledAt.toISOString()}`,
      {
        retryCount: newRetryCount,
        retryDelayMs,
        errorMessage,
      },
    );

    this.logger.log(
      `Scheduled retry for job ${jobId} at ${nextScheduledAt.toISOString()}`,
    );
    return retryJob;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | null {
    return this.jobs.get(jobId) ?? null;
  }

  /**
   * Get job with aggregated status for batch jobs
   */
  getJobWithAggregatedStatus(jobId: string): {
    job: Job;
    progress?: {
      total: number;
      completed: number;
      failed: number;
      pending: number;
    };
  } | null {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const childJobIds = job.metadata?.['childJobIds'] as string[] | undefined;
    if (
      !childJobIds ||
      !Array.isArray(childJobIds) ||
      childJobIds.length === 0
    ) {
      return { job };
    }

    const { progress, aggregatedStatus } = this.aggregateChildStatuses(
      childJobIds,
      job.status,
    );

    const aggregatedJob: Job = {
      ...job,
      status: aggregatedStatus,
      completedAt: this.isTerminalStatus(aggregatedStatus)
        ? new Date()
        : job.completedAt,
    };

    return { job: aggregatedJob, progress };
  }

  private aggregateChildStatuses(
    childJobIds: string[],
    parentStatus: JobStatus,
  ): {
    progress: {
      total: number;
      completed: number;
      failed: number;
      pending: number;
    };
    aggregatedStatus: JobStatus;
  } {
    const progress = {
      total: childJobIds.length,
      completed: 0,
      failed: 0,
      pending: 0,
    };

    for (const childId of childJobIds) {
      const status = this.jobs.get(childId)?.status;
      if (status === JobStatus.COMPLETED) {
        progress.completed++;
      } else if (status === JobStatus.FAILED) {
        progress.failed++;
      } else if (
        status === JobStatus.PENDING ||
        status === JobStatus.PROCESSING
      ) {
        progress.pending++;
      }
    }

    let aggregatedStatus: JobStatus = parentStatus;
    if (progress.failed > 0 && progress.pending === 0) {
      aggregatedStatus = JobStatus.FAILED;
    } else if (progress.completed === progress.total) {
      aggregatedStatus = JobStatus.COMPLETED;
    } else if (progress.pending > 0) {
      aggregatedStatus = JobStatus.PROCESSING;
    }

    return { progress, aggregatedStatus };
  }

  /**
   * Apply filters to job list
   */
  private applyFilters(jobs: Job[], filters: JobQueryFilters): Job[] {
    let filtered = jobs;
    const {
      status,
      type,
      priority,
      scheduledBefore,
      scheduledAfter,
      createdBefore,
      createdAfter,
    } = filters;
    const minPriority = priority?.min;
    const maxPriority = priority?.max;

    if (status?.length) {
      filtered = filtered.filter((job) => status.includes(job.status));
    }

    if (type?.length) {
      filtered = filtered.filter((job) => type.includes(job.type));
    }

    if (minPriority !== undefined) {
      filtered = filtered.filter((job) => job.priority >= minPriority);
    }

    if (maxPriority !== undefined) {
      filtered = filtered.filter((job) => job.priority <= maxPriority);
    }

    if (scheduledBefore) {
      filtered = filtered.filter((job) => job.scheduledAt <= scheduledBefore);
    }

    if (scheduledAfter) {
      filtered = filtered.filter((job) => job.scheduledAt >= scheduledAfter);
    }

    if (createdBefore) {
      filtered = filtered.filter((job) => job.createdAt <= createdBefore);
    }

    if (createdAfter) {
      filtered = filtered.filter((job) => job.createdAt >= createdAfter);
    }

    return filtered;
  }

  /**
   * Query jobs with filters, sorting, and pagination
   */
  queryJobs(filters: JobQueryFilters = {}): Job[] {
    const jobs = this.applyFilters(Array.from(this.jobs.values()), filters);
    jobs.sort((a, b) => this.compareJobsByPriorityAndSchedule(a, b));
    const offset = filters.offset ?? 0;
    return jobs.slice(offset, offset + (filters.limit ?? 50));
  }

  /**
   * Get job statistics
   */
  getJobStatistics(): JobStatistics {
    const stats: JobStatistics = {
      total: this.jobs.size,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case JobStatus.PENDING:
          stats.pending++;
          break;
        case JobStatus.PROCESSING:
          stats.processing++;
          break;
        case JobStatus.COMPLETED:
          stats.completed++;
          break;
        case JobStatus.FAILED:
          stats.failed++;
          break;
      }
    }

    return stats;
  }

  /**
   * Log job event with structured console output
   */
  logJobEvent(
    jobId: string,
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] Job ${jobId}: ${message}${
      metadata ? ` | ${JSON.stringify(metadata)}` : ''
    }`;

    // Store in memory for potential retrieval
    const logs = this.jobLogs.get(jobId) ?? [];
    logs.push(logEntry);
    this.jobLogs.set(jobId, logs);

    // Output to console with appropriate log level
    switch (level) {
      case LogLevel.INFO:
        this.logger.log(logEntry);
        break;
      case LogLevel.WARN:
        this.logger.warn(logEntry);
        break;
      case LogLevel.ERROR:
        this.logger.error(logEntry);
        break;
    }
  }

  /**
   * Get job logs from memory
   */
  getJobLogs(jobId: string): string[] {
    return this.jobLogs.get(jobId) ?? [];
  }

  /**
   * Clean up old completed jobs and their logs
   */
  private cleanupOldJobs(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [jobId, job] of this.jobs) {
      const isCompleted = this.isTerminalStatus(job.status);
      const isOld = job.completedAt && job.completedAt < oneHourAgo;

      if (isCompleted && isOld) {
        this.jobs.delete(jobId);
        this.jobLogs.delete(jobId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} old jobs from memory`);
    }
  }

  private compareJobsByPriorityAndSchedule(a: Job, b: Job): number {
    return (
      b.priority - a.priority ||
      a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );
  }

  private isTerminalStatus(status: JobStatus): boolean {
    return status === JobStatus.COMPLETED || status === JobStatus.FAILED;
  }

  /**
   * Cleanup resources when module is destroyed
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
