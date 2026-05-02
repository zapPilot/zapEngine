import { getErrorMessage } from '../../../common/utils';

/**
 * Job status enumeration representing the lifecycle of a job
 */
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Job type enumeration for different kinds of background jobs
 */
export enum JobType {
  WEEKLY_REPORT_BATCH = 'weekly_report_batch',
  WEEKLY_REPORT_SINGLE = 'weekly_report_single',
  DAILY_SUGGESTION_BATCH = 'daily_suggestion_batch',
  DAILY_SUGGESTION_SINGLE = 'daily_suggestion_single',
}

/**
 * Log level enumeration for job logging
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Base job interface defining the core structure of a job
 */
export interface Job {
  readonly id: string;
  readonly type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  priority: number;
  maxRetries: number;
  retryCount: number;
  retryDelaySeconds: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  readonly createdAt: Date;
  updatedAt: Date;
}

/**
 * Weekly report job payload interface
 */
export interface WeeklyReportJobPayload extends Record<string, unknown> {
  userIds?: string[];
  testMode?: boolean;
  testRecipient?: string;
}

/**
 * Single user weekly report job payload interface
 */
export interface SingleUserReportJobPayload extends Record<string, unknown> {
  userId: string;
  testMode?: boolean;
  testRecipient?: string;
}

/**
 * Daily suggestion batch job payload interface
 */
export interface DailySuggestionBatchPayload extends Record<string, unknown> {
  userIds?: string[];
}

/**
 * Daily suggestion single user job payload interface
 */
export interface DailySuggestionSinglePayload extends Record<string, unknown> {
  userId: string;
}

/**
 * Job creation options interface
 */
export interface CreateJobOptions {
  type: JobType;
  payload: Record<string, unknown>;
  priority?: number;
  maxRetries?: number;
  retryDelaySeconds?: number;
  scheduledAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Job processing result interface
 */
export interface JobProcessingResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Job statistics interface for monitoring
 */
export interface JobStatistics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

/**
 * Job query filters interface
 */
export interface JobQueryFilters {
  status?: JobStatus[];
  type?: JobType[];
  priority?: {
    min?: number;
    max?: number;
  };
  scheduledBefore?: Date;
  scheduledAfter?: Date;
  createdBefore?: Date;
  createdAfter?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Job processor interface for implementing job handlers
 */
export interface JobProcessor {
  readonly supportedJobTypes: JobType[];

  /**
   * Process a job and return the result
   */
  process(job: Job): Promise<JobProcessingResult>;

  /**
   * Optional cleanup method called after job processing
   */
  cleanup?(job: Job, result: JobProcessingResult): Promise<void>;
}

/**
 * Create a standardised failure result for job processing errors.
 */
export function createJobFailureResult(error: unknown): JobProcessingResult {
  return {
    success: false,
    error: getErrorMessage(error),
  };
}

/**
 * Create a standardised batch result for fan-out job processing.
 */
export function createBatchResult(
  totalUsers: number,
  createdJobs: string[],
  failedJobs: string[],
): JobProcessingResult {
  return {
    success: true,
    metadata: {
      totalUsers,
      successfulJobs: createdJobs.length,
      failedJobsCount: failedJobs.length,
      createdJobIds: createdJobs,
      failedUserIds: failedJobs,
      batchStatus: 'processing',
    },
  };
}
