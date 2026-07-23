import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ETLJobQueue } from '../../src/modules/core/jobQueue.js';

// Mock the ETL processor to avoid executing real pipelines
vi.mock('../../src/modules/core/pipelineFactory.js', () => ({
  ETLPipelineFactory: vi.fn().mockImplementation(function ETLPipelineFactory() {
    return {
      processJob: vi.fn().mockResolvedValue({
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: [],
        sourceResults: {},
      }),
    };
  }),
}));

// Mock logger
vi.mock('../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../setup/mocks.js');
  return mockLogger();
});

// Mock incremental portfolio rollup synchronizer
vi.mock('../../src/modules/core/portfolioRollupSync.js', () => ({
  portfolioRollupSynchronizer: {
    synchronize: vi.fn().mockResolvedValue({
      durationMs: 0,
      metrics: {
        portfolioKeysProcessed: 0,
        walletKeysProcessed: 0,
        usersProcessed: 0,
        portfolioRowsWritten: 0,
        walletRowsWritten: 0,
        trendRowsWritten: 0,
        remainingPortfolioKeys: 0,
        remainingWalletKeys: 0,
        remainingUsers: 0,
      },
    }),
  },
}));

// Mock database
vi.mock('../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

describe('Wallet fetch metadata preservation', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';
  let jobQueue: ETLJobQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    jobQueue = new ETLJobQueue();
  });

  it('preserves wallet_fetch metadata through enqueue and retrieval', async () => {
    const job = await jobQueue.enqueue({
      trigger: 'manual',
      sources: [],
      metadata: {
        jobType: 'wallet_fetch',
        userId: 'test-user-id',
        walletAddress,
      },
    });

    const retrieved = jobQueue.getJob(job.jobId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.metadata).toBeDefined();
    expect(retrieved?.metadata?.jobType).toBe('wallet_fetch');
    expect(retrieved?.metadata?.walletAddress).toBe(walletAddress);
    expect(retrieved?.metadata?.userId).toBe('test-user-id');
  });
});
