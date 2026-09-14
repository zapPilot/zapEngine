import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureBackgroundException: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../../src/observability/sentry.js', () => ({
  captureBackgroundException: mocks.captureBackgroundException,
}));
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: mocks.info, warn: mocks.warn },
}));

import {
  buildJobFailureError,
  buildPersistJobStatusQuery,
  createPendingJob,
  createSuccessResult,
  getPersistedErrorMessage,
  logJobCompletion,
  logPersistStatusFailure,
  resolveJobSuccess,
  resolveTrendUserScope,
  shouldPersistJobStatus,
  shouldSynchronizePortfolioRollups,
} from '../../../../src/modules/core/jobQueue.helpers.js';
import {
  accumulateSourceResult,
  buildJobSummary,
  createProcessingResult,
  createSingleSourceFailureResult,
  createSingleSourceSuccessResult,
  logJobProcessingCompleted,
} from '../../../../src/modules/core/pipelineFactory.helpers.js';

const job = {
  jobId: 'job-1',
  sources: ['debank'],
  tasks: [],
  filters: {},
  metadata: { jobType: 'wallet_fetch', userId: 'user-1' },
  createdAt: new Date('2026-09-14T00:00:00.000Z'),
  status: 'pending',
} as any;

function sourceResult(
  source = 'debank',
  overrides: Record<string, unknown> = {},
) {
  return {
    source,
    success: true,
    recordsProcessed: 2,
    recordsInserted: 1,
    errors: [],
    ...overrides,
  } as any;
}

function pipeline(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    recordsProcessed: 2,
    recordsInserted: 1,
    errors: [],
    sourceResults: { debank: sourceResult() },
    ...overrides,
  } as any;
}

describe('job queue helpers', () => {
  beforeEach(() => {
    mocks.captureBackgroundException.mockReset();
    mocks.info.mockReset();
    mocks.warn.mockReset();
  });

  it('creates pending jobs without changing caller metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T01:02:03.000Z'));
    const created = createPendingJob('job-2', job);
    expect(created).toMatchObject({
      jobId: 'job-2',
      sources: job.sources,
      tasks: job.tasks,
      filters: job.filters,
      metadata: job.metadata,
      status: 'pending',
      createdAt: new Date('2026-09-14T01:02:03.000Z'),
    });
    vi.useRealTimers();
  });

  it('decides whether portfolio rollups need synchronization', () => {
    expect(shouldSynchronizePortfolioRollups(job, pipeline())).toBe(true);
    expect(
      shouldSynchronizePortfolioRollups(
        job,
        pipeline({
          sourceResults: {
            debank: sourceResult('debank', { recordsInserted: 0 }),
            hyperliquid: sourceResult('hyperliquid'),
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldSynchronizePortfolioRollups(
        job,
        pipeline({ sourceResults: {}, recordsInserted: 0 }),
      ),
    ).toBe(true);
    expect(
      shouldSynchronizePortfolioRollups(
        { ...job, metadata: { jobType: 'scheduled' } },
        pipeline({ sourceResults: {}, recordsInserted: 0 }),
      ),
    ).toBe(false);
    expect(
      shouldSynchronizePortfolioRollups(
        job,
        pipeline({ success: false, sourceResults: {}, recordsInserted: 0 }),
      ),
    ).toBe(false);
  });

  it('resolves wallet trend scope, success, and persisted errors', () => {
    expect(resolveTrendUserScope(job)).toEqual(['user-1']);
    expect(
      resolveTrendUserScope({ ...job, metadata: { jobType: 'scheduled' } }),
    ).toBeNull();
    expect(resolveJobSuccess(job, pipeline())).toBe(true);
    expect(resolveJobSuccess(job, pipeline({ success: false }))).toBe(false);
    expect(resolveJobSuccess(job, pipeline(), 'rollup failed')).toBe(false);
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(getPersistedErrorMessage(job.metadata, 'rollup failed')).toBe(
      'rollup failed',
    );
    expect(getPersistedErrorMessage({ errorMessage: 'etl failed' })).toBe(
      'etl failed',
    );
    expect(getPersistedErrorMessage(undefined)).toBeUndefined();
  });

  it('builds success payloads from valid, invalid, and rollup errors', () => {
    const completed = createSuccessResult(
      job,
      {
        pipelineResult: pipeline({ errors: ['source warning', 42] }),
        etlDurationMs: 5,
        totalDurationMs: 8,
        rollupSyncError: 'rollup failed',
      },
      'failed',
    );
    expect(completed).toMatchObject({
      success: true,
      data: {
        jobId: 'job-1',
        status: 'failed',
        duration: 8,
        errors: ['source warning', 'rollup failed'],
      },
    });

    const withoutArray = createSuccessResult(
      job,
      {
        pipelineResult: pipeline({ errors: 'not-an-array' }),
        etlDurationMs: 1,
        totalDurationMs: 2,
      },
      'completed',
    );
    expect(withoutArray.data?.errors).toEqual([]);
  });

  it('logs completion with and without optional rollup details', () => {
    logJobCompletion(job, {
      pipelineResult: pipeline({ errors: 'not-an-array' }),
      etlDurationMs: 3,
      totalDurationMs: 4,
    });
    logJobCompletion(job, {
      pipelineResult: pipeline({ errors: ['warning'] }),
      etlDurationMs: 3,
      totalDurationMs: 6,
      rollupSyncStats: { durationMs: 2, metrics: { users: 1 } } as any,
      rollupSyncError: 'late rollup',
    });
    expect(mocks.info).toHaveBeenCalledTimes(2);
    expect(mocks.info.mock.calls[0]?.[1]).toMatchObject({
      rollupSyncIncluded: false,
      rollupSyncDurationMs: undefined,
      errors: 0,
    });
    expect(mocks.info.mock.calls[1]?.[1]).toMatchObject({
      rollupSyncIncluded: true,
      rollupSyncDurationMs: 2,
      errors: 1,
    });
  });

  it('validates persistence metadata and reports non-fatal failures', () => {
    expect(shouldPersistJobStatus()).toBe(false);
    expect(shouldPersistJobStatus({ userId: '' })).toBe(false);
    expect(shouldPersistJobStatus({ userId: 'user-1' })).toBe(true);

    const persistError = new Error('database offline');
    logPersistStatusFailure('job-1', 'failed', persistError);
    expect(mocks.warn).toHaveBeenCalledWith(
      'Failed to persist job status to database (non-fatal)',
      expect.objectContaining({ error: 'database offline' }),
    );
    expect(mocks.captureBackgroundException).toHaveBeenCalledWith(
      persistError,
      expect.objectContaining({
        component: 'job',
        tags: { operation: 'persist_status', job_status: 'failed' },
      }),
    );
  });

  it('builds failures from rollup, pipeline, fallback, and cause inputs', () => {
    expect(
      buildJobFailureError(pipeline(), 'rollup failed', undefined),
    ).toEqual(new Error('rollup failed'));
    expect(
      buildJobFailureError(
        pipeline({ errors: ['first', 2, 'second'] }),
        undefined,
        undefined,
      ).message,
    ).toBe('first; second');
    expect(
      buildJobFailureError(pipeline({ errors: [] }), undefined, undefined)
        .message,
    ).toBe('ETL job failed without a specific error');
    const cause = new Error('database offline');
    expect(buildJobFailureError(pipeline(), 'rollup failed', cause).cause).toBe(
      cause,
    );
  });

  it.each([
    ['pending', false, false],
    ['processing', true, false],
    ['completed', false, true],
    ['failed', false, true],
  ] as const)('builds %s persistence SQL', (status, started, completed) => {
    const result = buildPersistJobStatusQuery('job-1', status, {
      userId: 'user-1',
      walletAddress: '0xabc',
      ...(status === 'failed' ? { errorMessage: 'boom' } : {}),
    });
    expect(result.query.includes('started_at = NOW()')).toBe(started);
    expect(result.query.includes('completed_at = NOW()')).toBe(completed);
    expect(result.params).toEqual(
      status === 'failed'
        ? ['job-1', 'user-1', '0xabc', 'failed', 'boom']
        : ['job-1', 'user-1', '0xabc', status],
    );
  });
});

describe('pipeline result helpers', () => {
  beforeEach(() => mocks.info.mockReset());

  it('creates empty, failed, and single-source results', () => {
    expect(createProcessingResult()).toEqual({
      success: true,
      recordsProcessed: 0,
      recordsInserted: 0,
      errors: [],
      sourceResults: {},
    });
    expect(createSingleSourceFailureResult('boom')).toMatchObject({
      success: false,
      errors: ['boom'],
    });
    expect(createSingleSourceSuccessResult(sourceResult())).toMatchObject({
      success: true,
      recordsProcessed: 2,
      sourceResults: { debank: { source: 'debank' } },
    });
  });

  it('accumulates new and repeated source results including failures', () => {
    const target = createProcessingResult();
    accumulateSourceResult(target, 'debank' as any, sourceResult());
    accumulateSourceResult(
      target,
      'debank' as any,
      sourceResult('debank', {
        success: false,
        recordsProcessed: 3,
        recordsInserted: 0,
        errors: ['partial failure'],
      }),
    );
    expect(target).toMatchObject({
      success: false,
      recordsProcessed: 5,
      recordsInserted: 1,
      errors: ['debank: partial failure'],
      sourceResults: {
        debank: {
          success: false,
          recordsProcessed: 5,
          recordsInserted: 1,
          errors: ['partial failure'],
        },
      },
    });
  });

  it('summarizes and logs source results', () => {
    const result = pipeline({
      sourceResults: {
        debank: sourceResult('debank', { errors: ['warning'] }),
      },
    });
    expect(buildJobSummary(result.sourceResults)).toEqual({
      debank: { success: true, processed: 2, inserted: 1, errors: 1 },
    });
    logJobProcessingCompleted('Finished job', 'job-1', result, 9);
    expect(mocks.info).toHaveBeenCalledWith('Finished job', {
      jobId: 'job-1',
      success: true,
      recordsProcessed: 2,
      recordsInserted: 1,
      errorCount: 0,
      duration: 9,
      sourceResults: {
        debank: { success: true, processed: 2, inserted: 1, errors: 1 },
      },
    });
  });
});
