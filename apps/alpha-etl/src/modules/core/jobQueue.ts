import type { EtlError } from '@zapengine/types/etl';
import type { PoolClient } from 'pg';

import { getDbClient, TIMEOUTS } from '../../config/database.js';
import {
  mvRefresher,
  type MVRefreshStats,
} from '../../modules/core/mvRefresh.js';
import { ETLPipelineFactory } from '../../modules/core/pipelineFactory.js';
import type { ETLJob, ETLJobResult } from '../../types/index.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import {
  buildPersistJobStatusQuery,
  createFailedMvRefreshStats,
  createPendingJob,
  createSuccessResult,
  getPersistedErrorMessage,
  logJobCompletion,
  logPersistStatusFailure,
  type PersistedJobStatus,
  type PersistJobMetadata,
  resolveJobSuccess,
  shouldPersistJobStatus,
  shouldRefreshMaterializedViews,
} from './jobQueue.helpers.js';

export interface QueueStatus {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  isProcessing: boolean;
}

// Bound the in-memory queue: evict terminal (completed/failed) jobs once
// they age past TERMINAL_RETENTION_MS or when the count of terminal jobs
// exceeds MAX_TERMINAL_JOBS. Pending/processing jobs are never evicted.
// Wallet-fetch job state still survives in Postgres via persistJobStatus,
// so account-engine's polling path is unaffected by eviction.
export const TERMINAL_RETENTION_MS = 60 * 60 * 1000;
export const MAX_TERMINAL_JOBS = 500;

type PipelineProcessResult = Awaited<
  ReturnType<ETLPipelineFactory['processJob']>
>;

interface ProcessedJobOutcome {
  pipelineResult: PipelineProcessResult;
  etlDurationMs: number;
  totalDurationMs: number;
  mvRefreshStats?: MVRefreshStats | undefined;
  jobSuccess: boolean;
}

export class ETLJobQueue {
  // Current design: in-memory queue state, so process-local jobs are lost on restart.
  private readonly jobs = new Map<string, ETLJob>();
  private readonly results = new Map<string, ETLJobResult>();
  // Insertion-ordered map of jobId -> completion timestamp (ms). Used to evict
  // terminal jobs by age and count. Maps preserve insertion order, so iterating
  // gives us oldest-first without sorting.
  private readonly terminalAt = new Map<string, number>();
  private readonly processor: ETLPipelineFactory;
  // Current design: single worker to preserve simple FIFO processing semantics.
  private isProcessing = false;

  constructor() {
    this.processor = new ETLPipelineFactory();
  }

  async enqueue(
    params: Pick<ETLJob, 'sources' | 'tasks' | 'filters' | 'metadata'>,
  ): Promise<ETLJob> {
    const jobId = this.generateJobId();
    const job = createPendingJob(jobId, params);

    this.jobs.set(jobId, job);
    logger.info('Job queued', { jobId, sources: params.sources });

    // Persist job status to database (for wallet_fetch jobs only)
    await this.persistJobStatus(jobId, 'pending', params.metadata);

    void this.processNext();

    return job;
  }

  getJob(jobId: string): ETLJob | undefined {
    return this.jobs.get(jobId);
  }

  getResult(jobId: string): ETLJobResult | undefined {
    return this.results.get(jobId);
  }

  /**
   * Persist job status to database for account-engine job status polling
   * Only persists wallet_fetch jobs (identified by metadata.userId)
   * Non-fatal errors - logs and continues if persistence fails
   */
  private async persistJobStatus(
    jobId: string,
    status: PersistedJobStatus,
    metadata?: PersistJobMetadata,
  ): Promise<void> {
    // Only persist wallet_fetch jobs (have userId in metadata)
    if (!shouldPersistJobStatus(metadata)) {
      return;
    }

    let client: PoolClient | null = null;
    try {
      client = await getDbClient();
      const { query, params } = buildPersistJobStatusQuery(
        jobId,
        status,
        metadata,
      );
      await client.query(query, params);

      logger.debug('Job status persisted to database', {
        jobId,
        status,
        userId: metadata.userId,
      });
    } catch (error) {
      logPersistStatusFailure(jobId, status, error);
    } finally {
      client?.release();
    }
  }

  private async processNext(): Promise<void> {
    // Limitation: queue processing is intentionally sequential in this implementation.
    if (this.isProcessing) {
      return;
    }

    const pendingJob = this.getPendingJob();
    if (!pendingJob) {
      return;
    }

    await this.processPendingJob(pendingJob);
  }

  private getPendingJob(): ETLJob | undefined {
    // Limitation: pending jobs are selected with simple FIFO semantics and no priorities.
    return Array.from(this.jobs.values()).find(
      (job) => job.status === 'pending',
    );
  }

  private async markJobAsProcessing(job: ETLJob): Promise<void> {
    this.isProcessing = true;
    job.status = 'processing';
    await this.persistJobStatus(job.jobId, 'processing', job.metadata);
  }

  private async processPendingJob(job: ETLJob): Promise<void> {
    await this.markJobAsProcessing(job);

    try {
      const outcome = await this.executeJob(job);
      await this.finalizeProcessedJob(job, outcome);
    } catch (error) {
      await this.handleJobFailure(job, error);
    } finally {
      this.isProcessing = false;
      this.scheduleNextProcessing();
    }
  }

  private async executeJob(job: ETLJob): Promise<ProcessedJobOutcome> {
    logger.info('Starting ETL job processing', {
      jobId: job.jobId,
      sources: job.sources,
    });

    const startTime = Date.now();
    const pipelineResult = await this.processor.processJob(job);
    const etlDurationMs = Date.now() - startTime;
    const mvRefreshStats = await this.refreshMaterializedViewsIfNeeded(
      job,
      pipelineResult,
      startTime,
    );
    const totalDurationMs = Date.now() - startTime;
    const jobSuccess = resolveJobSuccess(job, pipelineResult, mvRefreshStats);

    return {
      pipelineResult,
      etlDurationMs,
      totalDurationMs,
      mvRefreshStats,
      jobSuccess,
    };
  }

  private async refreshMaterializedViewsIfNeeded(
    job: ETLJob,
    pipelineResult: PipelineProcessResult,
    startTimeMs: number,
  ): Promise<MVRefreshStats | undefined> {
    // Refresh materialized views BEFORE marking job as completed
    // This ensures /jobs/:jobId returns 'processing' until MVs are ready
    const shouldRefresh = shouldRefreshMaterializedViews(job, pipelineResult);

    if (!shouldRefresh) {
      logger.debug('Skipping MV refresh (no records inserted)', {
        jobId: job.jobId,
        success: pipelineResult.success,
        recordsInserted: pipelineResult.recordsInserted,
        isWalletJob: job.metadata?.jobType === 'wallet_fetch',
      });
      return undefined;
    }

    if (!pipelineResult.success && pipelineResult.recordsInserted > 0) {
      logger.warn(
        'Refreshing MVs despite ETL partial failure because records were inserted',
        {
          jobId: job.jobId,
          recordsInserted: pipelineResult.recordsInserted,
          errors: pipelineResult.errors.length,
        },
      );
    }

    try {
      logger.info('Starting MV refresh (job still processing)', {
        jobId: job.jobId,
        recordsInserted: pipelineResult.recordsInserted,
      });

      const mvRefreshStats = await mvRefresher.refreshAllViews(job.jobId);
      logger.info('MV refresh completed', {
        jobId: job.jobId,
        mvRefreshDurationMs: mvRefreshStats.totalDurationMs,
        allSucceeded: mvRefreshStats.allSucceeded,
        failedCount: mvRefreshStats.failedCount,
        skippedCount: mvRefreshStats.skippedCount,
      });
      return mvRefreshStats;
    } catch (error) {
      logger.error('MV refresh failed - marking job as failed', {
        jobId: job.jobId,
        error: toErrorMessage(error),
      });

      const mvRefreshDurationMs = Date.now() - startTimeMs;
      return createFailedMvRefreshStats(mvRefreshDurationMs);
    }
  }

  private async finalizeProcessedJob(
    job: ETLJob,
    outcome: ProcessedJobOutcome,
  ): Promise<void> {
    const finalStatus: 'completed' | 'failed' = outcome.jobSuccess
      ? 'completed'
      : 'failed';
    job.status = finalStatus;
    this.terminalAt.set(job.jobId, Date.now());

    const jobResult = createSuccessResult(job, outcome, finalStatus);
    this.results.set(job.jobId, jobResult);

    logJobCompletion(job, outcome);

    await this.persistJobStatus(job.jobId, job.status, {
      ...job.metadata,
      errorMessage: getPersistedErrorMessage(
        job.metadata,
        outcome.jobSuccess,
        outcome.mvRefreshStats,
      ),
    });
  }

  private async handleJobFailure(job: ETLJob, error: unknown): Promise<void> {
    logger.error('Job processing failed', { jobId: job.jobId, error });

    job.status = 'failed';
    this.terminalAt.set(job.jobId, Date.now());

    await this.persistJobStatus(job.jobId, 'failed', {
      ...job.metadata,
      errorMessage: toErrorMessage(error),
    });

    const etlError: EtlError = {
      code: 'INTERNAL_ERROR',
      message: toErrorMessage(error),
    };

    this.results.set(job.jobId, {
      success: false,
      error: {
        ...etlError,
        source: 'system',
        context: { jobId: job.jobId },
      },
    });
  }

  private scheduleNextProcessing(): void {
    // Limitation: a small delay keeps the sequential in-memory queue from tight-looping.
    setTimeout(() => {
      this.evictTerminalJobs();
      void this.processNext();
    }, TIMEOUTS.JOB_PROCESSING_DELAY_MS);
  }

  /**
   * Evict terminal jobs (completed/failed) that exceed the retention window
   * or count cap. Pending/processing jobs are never touched.
   *
   * Iteration order is insertion order (Map semantics), so the loop visits
   * oldest entries first — we evict by age first, then by count if too many
   * remain. O(n) per call where n is bounded by MAX_TERMINAL_JOBS.
   */
  private evictTerminalJobs(): void {
    const now = Date.now();
    for (const [jobId, completedAt] of this.terminalAt) {
      if (now - completedAt < TERMINAL_RETENTION_MS) {
        // Map is insertion-ordered; once one entry is fresh, the rest are too.
        break;
      }
      this.removeTerminalJob(jobId);
    }

    const overflow = this.terminalAt.size - MAX_TERMINAL_JOBS;
    if (overflow <= 0) {
      return;
    }

    let dropped = 0;
    for (const jobId of this.terminalAt.keys()) {
      if (dropped >= overflow) {
        break;
      }
      this.removeTerminalJob(jobId);
      dropped += 1;
    }
  }

  private removeTerminalJob(jobId: string): void {
    this.jobs.delete(jobId);
    this.results.delete(jobId);
    this.terminalAt.delete(jobId);
    logger.debug('Evicted terminal job', { jobId });
  }

  getQueueStatus(): QueueStatus {
    const jobs = Array.from(this.jobs.values());
    const counts: Pick<
      QueueStatus,
      'pending' | 'processing' | 'completed' | 'failed'
    > = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    for (const job of jobs) {
      counts[job.status]++;
    }
    return {
      total: jobs.length,
      ...counts,
      isProcessing: this.isProcessing,
    };
  }

  private generateJobId(): string {
    return `etl_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
