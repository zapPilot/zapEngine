import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ETLJobQueue } from '../../../../src/modules/core/jobQueue.js';
import { portfolioRollupSynchronizer } from '../../../../src/modules/core/portfolioRollupSync.js';

vi.mock('../../../../src/modules/core/pipelineFactory.js', () => ({
  ETLPipelineFactory: class {
    processJob = vi.fn();
  },
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/modules/core/portfolioRollupSync.js', () => ({
  portfolioRollupSynchronizer: {
    synchronize: vi.fn().mockResolvedValue({
      durationMs: 0,
      metrics: { usersProcessed: 0, trendRowsWritten: 0 },
    }),
  },
}));

const job = {
  jobId: 'job-1',
  sources: ['hyperliquid'],
  tasks: [],
  filters: {},
  metadata: {},
  createdAt: new Date('2026-09-14T00:00:00.000Z'),
  status: 'processing',
} as any;

function sourceResult(source: string, overrides: Record<string, unknown> = {}) {
  return {
    source,
    success: true,
    recordsProcessed: 2,
    recordsInserted: 1,
    errors: [],
    ...overrides,
  } as any;
}

describe('job queue rollup sync coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs after a partial write that has no debank result', async () => {
    const queue = new ETLJobQueue() as unknown as {
      synchronizePortfolioRollupsIfNeeded: (
        job: unknown,
        pipelineResult: unknown,
      ) => Promise<{ stats?: unknown; error?: string }>;
    };

    // success=false keeps the warn path; hyperliquid inserts keep the sync
    // enabled while sourceResults lacks debank entirely.
    const outcome = await queue.synchronizePortfolioRollupsIfNeeded(job, {
      success: false,
      recordsProcessed: 2,
      recordsInserted: 1,
      errors: ['debank exploded'],
      sourceResults: {
        hyperliquid: sourceResult('hyperliquid', { recordsInserted: 1 }),
      },
    });

    expect(outcome.error).toBeUndefined();
    expect(outcome.stats).toEqual({
      durationMs: 0,
      metrics: { usersProcessed: 0, trendRowsWritten: 0 },
    });
    expect(portfolioRollupSynchronizer.synchronize).toHaveBeenCalledTimes(1);
  });
});
