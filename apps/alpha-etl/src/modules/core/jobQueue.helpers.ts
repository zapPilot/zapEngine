import type { ETLJob, ETLJobResult } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ETLJobProcessingResult } from './pipelineFactory.helpers.js';
import type { PortfolioRollupSyncStats } from './portfolioRollupSync.js';

export type PersistedJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface PersistJobMetadata {
  userId?: string | undefined;
  walletAddress?: string | undefined;
  errorMessage?: string | undefined;
}

export interface PersistJobQueryPayload {
  query: string;
  params: unknown[];
}

interface ProcessedJobOutcomeLike {
  pipelineResult: ETLJobProcessingResult;
  etlDurationMs: number;
  totalDurationMs: number;
  rollupSyncStats?: PortfolioRollupSyncStats | undefined;
  rollupSyncError?: string | undefined;
}

function normalizeJobErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((error): error is string => typeof error === 'string');
}

export function createPendingJob(
  jobId: string,
  params: Pick<ETLJob, 'sources' | 'tasks' | 'filters' | 'metadata'>,
): ETLJob {
  return {
    jobId,
    sources: params.sources,
    tasks: params.tasks,
    filters: params.filters,
    metadata: params.metadata,
    createdAt: new Date(),
    status: 'pending',
  };
}

export function shouldSynchronizePortfolioRollups(
  job: ETLJob,
  pipelineResult: ETLJobProcessingResult,
): boolean {
  const debankResult = pipelineResult.sourceResults.debank;
  if (debankResult && debankResult.recordsInserted > 0) {
    return true;
  }

  const isWalletJob = job.metadata?.jobType === 'wallet_fetch';
  return isWalletJob && pipelineResult.success;
}

export function resolveJobSuccess(
  job: ETLJob,
  pipelineResult: ETLJobProcessingResult,
  rollupSyncError?: string,
): boolean {
  if (!rollupSyncError) {
    return pipelineResult.success;
  }

  logger.warn('Job marked as failed due to portfolio rollup sync failure', {
    jobId: job.jobId,
    etlSuccess: pipelineResult.success,
    error: rollupSyncError,
  });

  return false;
}

export function getPersistedErrorMessage(
  metadata: ETLJob['metadata'] | undefined,
  rollupSyncError?: string,
): string | undefined {
  return rollupSyncError ?? metadata?.errorMessage;
}

export function createSuccessResult(
  job: ETLJob,
  outcome: ProcessedJobOutcomeLike,
  finalStatus: 'completed' | 'failed',
): ETLJobResult {
  const { pipelineResult, totalDurationMs, rollupSyncError } = outcome;
  const errors = normalizeJobErrors(pipelineResult.errors);
  if (rollupSyncError) {
    errors.push(rollupSyncError);
  }

  return {
    success: true,
    data: {
      jobId: job.jobId,
      status: finalStatus,
      recordsProcessed: pipelineResult.recordsProcessed,
      recordsInserted: pipelineResult.recordsInserted,
      sourceResults: pipelineResult.sourceResults,
      duration: totalDurationMs,
      completedAt: new Date(),
      errors,
    },
  };
}

export function logJobCompletion(
  job: ETLJob,
  outcome: ProcessedJobOutcomeLike,
): void {
  const errors = normalizeJobErrors(outcome.pipelineResult.errors);

  logger.info('ETL job completed', {
    jobId: job.jobId,
    success: outcome.pipelineResult.success,
    recordsProcessed: outcome.pipelineResult.recordsProcessed,
    recordsInserted: outcome.pipelineResult.recordsInserted,
    etlDurationMs: outcome.etlDurationMs,
    totalDurationMs: outcome.totalDurationMs,
    rollupSyncIncluded: !!outcome.rollupSyncStats,
    rollupSyncDurationMs: outcome.rollupSyncStats?.durationMs,
    rollupSyncMetrics: outcome.rollupSyncStats?.metrics,
    rollupSyncError: outcome.rollupSyncError,
    errors: errors.length,
  });
}

export function shouldPersistJobStatus(
  metadata?: PersistJobMetadata,
): metadata is Required<Pick<PersistJobMetadata, 'userId'>> &
  PersistJobMetadata {
  return typeof metadata?.userId === 'string' && metadata.userId.length > 0;
}

export function logPersistStatusFailure(
  jobId: string,
  status: PersistedJobStatus,
  error: unknown,
): void {
  // Non-fatal error - log and continue
  logger.warn('Failed to persist job status to database (non-fatal)', {
    jobId,
    status,
    error: toErrorMessage(error),
  });
}

export function buildPersistJobStatusQuery(
  jobId: string,
  status: PersistedJobStatus,
  metadata: PersistJobMetadata,
): PersistJobQueryPayload {
  const updateColumns: string[] = [
    'status = EXCLUDED.status',
    'updated_at = NOW()',
  ];
  const values: unknown[] = [
    jobId,
    metadata.userId,
    metadata.walletAddress,
    status,
  ];

  if (status === 'processing') {
    updateColumns.push('started_at = NOW()');
  }
  if (status === 'completed' || status === 'failed') {
    updateColumns.push('completed_at = NOW()');
  }
  if (metadata.errorMessage) {
    updateColumns.push(`error_message = $${values.length + 1}`);
    values.push(metadata.errorMessage);
  }

  const query = `
      INSERT INTO alpha_raw.etl_job_queue
      (job_id, user_id, wallet_address, job_type, status, created_at)
      VALUES ($1, $2, $3, 'wallet_onboarding', $4, NOW())
      ON CONFLICT (job_id)
      DO UPDATE SET
        ${updateColumns.join(',\n        ')}
    `;

  return { query, params: values };
}
