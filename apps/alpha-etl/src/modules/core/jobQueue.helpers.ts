import { MV_REFRESH_CONFIG } from '../../config/constants.js';
import type { MVRefreshStats } from '../../modules/core/mvRefresh.js';
import type { ETLJob, ETLJobResult } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ETLJobProcessingResult } from './pipelineFactory.helpers.js';

export const MATERIALIZED_VIEW_NAMES = MV_REFRESH_CONFIG.MATERIALIZED_VIEWS.map(
  (mv) => mv.name,
);

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
  mvRefreshStats?: MVRefreshStats | undefined;
}

function normalizeJobErrors(errors: unknown): string[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.filter((error): error is string => typeof error === 'string');
}

export function createPendingJob(
  jobId: string,
  params: Pick<ETLJob, 'trigger' | 'sources' | 'filters' | 'metadata'>,
): ETLJob {
  return {
    jobId,
    trigger: params.trigger,
    sources: params.sources,
    filters: params.filters,
    metadata: params.metadata,
    createdAt: new Date(),
    status: 'pending',
  };
}

export function createFailedMvRefreshStats(
  mvRefreshDurationMs: number,
): MVRefreshStats {
  const results = MATERIALIZED_VIEW_NAMES.map((mvName) => ({
    mvName,
    success: false,
    skipped: false,
    durationMs: 0,
  }));

  return {
    allSucceeded: false,
    totalDurationMs: mvRefreshDurationMs,
    failedCount: results.length,
    skippedCount: 0,
    results,
  };
}

export function shouldRefreshMaterializedViews(
  job: ETLJob,
  pipelineResult: ETLJobProcessingResult,
): boolean {
  if (pipelineResult.recordsInserted > 0) {
    return true;
  }

  const isWalletJob = job.metadata?.jobType === 'wallet_fetch';
  return isWalletJob && pipelineResult.success;
}

export function resolveJobSuccess(
  job: ETLJob,
  pipelineResult: ETLJobProcessingResult,
  mvRefreshStats?: MVRefreshStats,
): boolean {
  if (!mvRefreshStats || mvRefreshStats.allSucceeded) {
    return pipelineResult.success;
  }

  logger.warn('Job marked as failed due to MV refresh failure', {
    jobId: job.jobId,
    etlSuccess: pipelineResult.success,
    mvFailedCount: mvRefreshStats.failedCount,
    mvSkippedCount: mvRefreshStats.skippedCount,
  });

  return false;
}

export function getPersistedErrorMessage(
  metadata: ETLJob['metadata'] | undefined,
  jobSuccess: boolean,
  mvRefreshStats?: MVRefreshStats,
): string | undefined {
  if (!jobSuccess && mvRefreshStats && !mvRefreshStats.allSucceeded) {
    return `MV refresh failed: ${mvRefreshStats.failedCount} views failed, ${mvRefreshStats.skippedCount} skipped`;
  }
  return metadata?.errorMessage;
}

export function createSuccessResult(
  job: ETLJob,
  outcome: ProcessedJobOutcomeLike,
  finalStatus: 'completed' | 'failed',
): ETLJobResult {
  const { pipelineResult, totalDurationMs, mvRefreshStats } = outcome;
  const errors = normalizeJobErrors(pipelineResult.errors);

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
      ...(mvRefreshStats && {
        mvRefreshDurationMs: mvRefreshStats.totalDurationMs,
        mvRefreshSuccess: mvRefreshStats.allSucceeded,
        mvRefreshFailedCount: mvRefreshStats.failedCount,
        mvRefreshSkippedCount: mvRefreshStats.skippedCount,
        mvRefreshResults: mvRefreshStats.results,
      }),
    },
  };
}

export function logJobCompletion(
  job: ETLJob,
  outcome: ProcessedJobOutcomeLike,
): void {
  const errors = normalizeJobErrors(outcome.pipelineResult.errors);

  logger.info('ETL job completed (including MV refresh)', {
    jobId: job.jobId,
    success: outcome.pipelineResult.success,
    recordsProcessed: outcome.pipelineResult.recordsProcessed,
    recordsInserted: outcome.pipelineResult.recordsInserted,
    etlDurationMs: outcome.etlDurationMs,
    totalDurationMs: outcome.totalDurationMs,
    mvRefreshIncluded: !!outcome.mvRefreshStats,
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
