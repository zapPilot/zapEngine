import type { Logger } from '@common/logger';
import {
  Job,
  JobStatus,
  JobType,
} from '@modules/jobs/interfaces/job.interface';
import type { JobQueueService } from '@modules/jobs/job-queue.service';
import { BatchFanoutHelper } from '@modules/jobs/utils/batch-fanout.helper';
import { PortfolioNotFoundError } from '@modules/notifications/errors/portfolio-not-found.error';

const now = new Date('2026-01-01T00:00:00.000Z');

function createParentJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'parent-job-1',
    type: JobType.WEEKLY_REPORT_BATCH,
    status: JobStatus.PENDING,
    payload: {},
    priority: 0,
    maxRetries: 3,
    retryCount: 0,
    retryDelaySeconds: 60,
    scheduledAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMocks() {
  let nextChildJobId = 1;
  const jobQueueService = {
    createJob: vi.fn().mockImplementation((opts) => ({
      id: `child-${nextChildJobId++}`,
      type: opts.type,
      status: JobStatus.PENDING,
      payload: opts.payload,
      priority: opts.priority ?? 0,
      maxRetries: opts.maxRetries ?? 3,
      retryCount: 0,
      retryDelaySeconds: opts.retryDelaySeconds ?? 60,
      scheduledAt: now,
      createdAt: now,
      updatedAt: now,
    })),
    logJobEvent: vi.fn(),
    updateJobMetadata: vi.fn(),
    updateJobStatus: vi.fn(),
  };

  const logger = {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const helper = new BatchFanoutHelper(
    jobQueueService as unknown as JobQueueService,
    logger as unknown as Logger,
  );

  return { helper, jobQueueService, logger };
}

describe('BatchFanoutHelper.fanOutBatch', () => {
  it('creates one child job per userId', () => {
    const { helper, jobQueueService } = createMocks();
    const parent = createParentJob();

    helper.fanOutBatch(
      parent,
      ['u-1', 'u-2', 'u-3'],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({
        userId: id,
      }),
    );

    expect(jobQueueService.createJob).toHaveBeenCalledTimes(3);
  });

  it('calls onFanoutStart with total user count when provided', () => {
    const { helper } = createMocks();
    const parent = createParentJob();
    const onFanoutStart = vi.fn();

    helper.fanOutBatch(
      parent,
      ['u-1', 'u-2'],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({ userId: id }),
      onFanoutStart,
    );

    expect(onFanoutStart).toHaveBeenCalledWith(2);
  });

  it('does not call onFanoutStart when not provided', () => {
    const { helper, jobQueueService } = createMocks();
    const parent = createParentJob();

    // No error should be thrown
    expect(() =>
      helper.fanOutBatch(
        parent,
        ['u-1'],
        JobType.WEEKLY_REPORT_SINGLE,
        (id) => ({ userId: id }),
      ),
    ).not.toThrow();
    expect(jobQueueService.createJob).toHaveBeenCalledTimes(1);
  });

  it('pushes userId to failedJobs and logs error when createJob throws', () => {
    const { helper, jobQueueService, logger } = createMocks();
    jobQueueService.createJob.mockImplementationOnce(() => {
      throw new Error('DB write failed');
    });
    const parent = createParentJob();

    const result = helper.fanOutBatch(
      parent,
      ['u-fail', 'u-ok'],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({ userId: id }),
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('u-fail'),
      expect.any(Error),
    );
    expect(result.metadata?.['failedJobsCount']).toBe(1);
    expect(result.metadata?.['successfulJobs']).toBe(1);
  });

  it('logs an error job event when createJob throws', () => {
    const { helper, jobQueueService } = createMocks();
    jobQueueService.createJob.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const parent = createParentJob();

    helper.fanOutBatch(
      parent,
      ['u-fail'],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({
        userId: id,
      }),
    );

    expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
      'parent-job-1',
      'ERROR',
      expect.stringContaining('u-fail'),
      expect.objectContaining({ userId: 'u-fail' }),
    );
  });

  it('calls updateJobMetadata with childJobIds, totalUsers, and isBatchJob', () => {
    const { helper, jobQueueService } = createMocks();
    const parent = createParentJob();

    helper.fanOutBatch(parent, ['u-1'], JobType.WEEKLY_REPORT_SINGLE, (id) => ({
      userId: id,
    }));

    expect(jobQueueService.updateJobMetadata).toHaveBeenCalledWith(
      'parent-job-1',
      expect.objectContaining({
        totalUsers: 1,
        isBatchJob: true,
        childJobIds: expect.any(Array),
      }),
    );
  });

  it('calls updateJobStatus with PROCESSING', () => {
    const { helper, jobQueueService } = createMocks();
    const parent = createParentJob();

    helper.fanOutBatch(parent, ['u-1'], JobType.WEEKLY_REPORT_SINGLE, (id) => ({
      userId: id,
    }));

    expect(jobQueueService.updateJobStatus).toHaveBeenCalledWith(
      'parent-job-1',
      JobStatus.PROCESSING,
    );
  });

  it('handles an empty userIds array (zero iterations)', () => {
    const { helper, jobQueueService } = createMocks();
    const parent = createParentJob();

    const result = helper.fanOutBatch(
      parent,
      [],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({
        userId: id,
      }),
    );

    expect(jobQueueService.createJob).not.toHaveBeenCalled();
    expect(result.metadata?.['totalUsers']).toBe(0);
    expect(result.metadata?.['successfulJobs']).toBe(0);
  });

  it('returns a createBatchResult with correct counts', () => {
    const { helper } = createMocks();
    const parent = createParentJob();

    const result = helper.fanOutBatch(
      parent,
      ['u-1', 'u-2'],
      JobType.WEEKLY_REPORT_SINGLE,
      (id) => ({ userId: id }),
    );

    expect(result.success).toBe(true);
    expect(result.metadata?.['totalUsers']).toBe(2);
    expect(result.metadata?.['successfulJobs']).toBe(2);
    expect(result.metadata?.['failedJobsCount']).toBe(0);
  });
});

describe('BatchFanoutHelper.handleSkippableError', () => {
  it('returns null for a non-PortfolioNotFoundError', () => {
    const { helper } = createMocks();
    const result = helper.handleSkippableError(
      'job-1',
      'user-1',
      new Error('random'),
    );
    expect(result).toBeNull();
  });

  it('returns a skipped JobProcessingResult for PortfolioNotFoundError', () => {
    const { helper } = createMocks();
    const result = helper.handleSkippableError(
      'job-1',
      'user-1',
      new PortfolioNotFoundError('user-1'),
    );
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.metadata?.['skipped']).toBe(true);
    expect(result!.metadata?.['skipReason']).toBe('portfolio_not_found');
  });

  it('logs a warning when PortfolioNotFoundError is handled', () => {
    const { helper, logger } = createMocks();
    helper.handleSkippableError(
      'job-1',
      'user-1',
      new PortfolioNotFoundError('user-1'),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('user-1'));
  });

  it('calls logJobEvent with WARN level', () => {
    const { helper, jobQueueService } = createMocks();
    helper.handleSkippableError(
      'job-1',
      'user-1',
      new PortfolioNotFoundError('user-1'),
    );
    expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
      'job-1',
      'WARN',
      expect.any(String),
      expect.objectContaining({
        userId: 'user-1',
        skipReason: 'portfolio_not_found',
      }),
    );
  });

  it('includes additionalContext in the result metadata', () => {
    const { helper } = createMocks();
    const result = helper.handleSkippableError(
      'job-1',
      'user-1',
      new PortfolioNotFoundError('user-1'),
      { jobType: 'weekly_report' },
    );
    expect(result!.metadata?.['jobType']).toBe('weekly_report');
  });
});
