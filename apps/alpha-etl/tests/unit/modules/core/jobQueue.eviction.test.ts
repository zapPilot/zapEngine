import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ETLJobQueue,
  MAX_TERMINAL_JOBS,
  TERMINAL_RETENTION_MS,
} from '../../../../src/modules/core/jobQueue.js';
import { castTo } from '../../../utils/typeCasts.ts';

vi.mock('../../../../src/modules/core/pipelineFactory.js', () => ({
  ETLPipelineFactory: class {
    processJob = vi.fn();
  },
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/modules/core/mvRefresh.js', () => ({
  mvRefresher: {
    refreshAllViews: vi.fn().mockResolvedValue({
      totalDurationMs: 0,
      results: [],
      allSucceeded: true,
      failedCount: 0,
      skippedCount: 0,
    }),
  },
}));

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    // Wallet-fetch persistence is bypassed by skipping userId metadata in tests.
    getDbClient: vi.fn(),
  };
});

// Private surface of ETLJobQueue we need to drive eviction directly. Kept
// separate from the public class type to avoid the `private` intersection
// conflict that collapses to `never` under strict TS.
interface JobQueueInternals {
  jobs: Map<string, { jobId: string; status: string }>;
  results: Map<string, unknown>;
  terminalAt: Map<string, number>;
  evictTerminalJobs: () => void;
  finalizeProcessedJob: (job: unknown, outcome: unknown) => Promise<void>;
}

function internals(queue: ETLJobQueue): JobQueueInternals {
  return castTo<JobQueueInternals>(queue);
}

function seedTerminalJob(
  queue: ETLJobQueue,
  jobId: string,
  status: 'completed' | 'failed',
  completedAt: number,
): void {
  const i = internals(queue);
  i.jobs.set(jobId, { jobId, status });
  i.results.set(jobId, { success: status === 'completed' });
  i.terminalAt.set(jobId, completedAt);
}

describe('ETLJobQueue terminal-job eviction', () => {
  let queue: ETLJobQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
    queue = new ETLJobQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('keeps terminal jobs that are still within the retention window', () => {
    const now = Date.now();
    seedTerminalJob(queue, 'fresh', 'completed', now - 60_000); // 1 minute old

    internals(queue).evictTerminalJobs();

    expect(queue.getJob('fresh')).toBeDefined();
    expect(queue.getResult('fresh')).toBeDefined();
  });

  it('evicts terminal jobs older than TERMINAL_RETENTION_MS', () => {
    const now = Date.now();
    seedTerminalJob(
      queue,
      'stale',
      'completed',
      now - TERMINAL_RETENTION_MS - 1,
    );
    seedTerminalJob(queue, 'fresh', 'completed', now - 60_000);

    internals(queue).evictTerminalJobs();

    expect(queue.getJob('stale')).toBeUndefined();
    expect(queue.getResult('stale')).toBeUndefined();
    expect(queue.getJob('fresh')).toBeDefined();
  });

  it('stops scanning at the first fresh entry (Map insertion order)', () => {
    const now = Date.now();
    // Insertion order is the iteration order. Seeding stale-then-fresh means
    // the loop walks the stale one first, then breaks on the fresh one.
    seedTerminalJob(queue, 'stale', 'failed', now - TERMINAL_RETENTION_MS - 1);
    seedTerminalJob(queue, 'fresh', 'completed', now - 60_000);

    internals(queue).evictTerminalJobs();

    expect(internals(queue).terminalAt.has('stale')).toBe(false);
    expect(internals(queue).terminalAt.has('fresh')).toBe(true);
  });

  it('caps the number of retained terminal jobs at MAX_TERMINAL_JOBS', () => {
    const now = Date.now();
    // All fresh (under retention window) but over the count cap.
    for (let i = 0; i < MAX_TERMINAL_JOBS + 3; i += 1) {
      seedTerminalJob(queue, `job-${i}`, 'completed', now - 60_000);
    }

    internals(queue).evictTerminalJobs();

    expect(internals(queue).terminalAt.size).toBe(MAX_TERMINAL_JOBS);
    // Oldest three (job-0, job-1, job-2) were dropped; newest survive.
    expect(queue.getJob('job-0')).toBeUndefined();
    expect(queue.getJob('job-1')).toBeUndefined();
    expect(queue.getJob('job-2')).toBeUndefined();
    expect(queue.getJob(`job-${MAX_TERMINAL_JOBS + 2}`)).toBeDefined();
  });

  it('never evicts pending or processing jobs', () => {
    const now = Date.now();
    const i = internals(queue);
    // Pending and processing jobs do NOT get a terminalAt entry, so eviction
    // should leave them alone even if many terminal jobs would be dropped.
    i.jobs.set('alive-pending', {
      jobId: 'alive-pending',
      status: 'pending',
    });
    i.jobs.set('alive-processing', {
      jobId: 'alive-processing',
      status: 'processing',
    });
    seedTerminalJob(
      queue,
      'stale',
      'completed',
      now - TERMINAL_RETENTION_MS - 1,
    );

    i.evictTerminalJobs();

    expect(queue.getJob('alive-pending')).toBeDefined();
    expect(queue.getJob('alive-processing')).toBeDefined();
    expect(queue.getJob('stale')).toBeUndefined();
  });

  it('finalizeProcessedJob stamps terminalAt so the job becomes evictable', async () => {
    const i = internals(queue);
    const job = {
      jobId: 'job-final',
      sources: ['debank'],
      status: 'processing' as const,
      createdAt: new Date(),
    };
    i.jobs.set(job.jobId, job);

    await i.finalizeProcessedJob(job, {
      pipelineResult: {
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        sourceResults: {},
        errors: [],
      },
      etlDurationMs: 1,
      totalDurationMs: 1,
      jobSuccess: true,
    });

    expect(i.terminalAt.has('job-final')).toBe(true);
    expect(i.terminalAt.get('job-final')).toBe(Date.now());
  });
});
