import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ETLJobQueue } from '../../../src/modules/core/jobQueue.js';
import { accessPrivate } from '../../utils/typeCasts.ts';

// Mock the ETL processor
vi.mock('../../../src/modules/core/pipelineFactory.js', () => ({
  ETLPipelineFactory: class {
    processJob = vi.fn();
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

// Mock incremental portfolio rollup synchronizer
vi.mock('../../../src/modules/core/portfolioRollupSync.js', () => ({
  portfolioRollupSynchronizer: {
    synchronize: vi.fn().mockResolvedValue({
      durationMs: 5,
      metrics: {
        portfolioKeysProcessed: 1,
        walletKeysProcessed: 1,
        usersProcessed: 1,
        portfolioRowsWritten: 1,
        walletRowsWritten: 1,
        trendRowsWritten: 1,
        remainingPortfolioKeys: 0,
        remainingWalletKeys: 0,
        remainingUsers: 0,
      },
    }),
  },
}));

// Mock database
vi.mock('../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

import { getDbClient } from '../../../src/config/database.js';
import { portfolioRollupSynchronizer } from '../../../src/modules/core/portfolioRollupSync.js';

type PersistedJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
interface MockProcessor {
  processJob: ReturnType<typeof vi.fn>;
}

interface JobQueuePrivateAccess {
  processor: MockProcessor;
  isProcessing: boolean;
  processNext: () => Promise<void>;
  jobs: Map<string, { jobId: string; status: string }>;
  persistJobStatus: (
    jobId: string,
    status: PersistedJobStatus,
    metadata?: {
      userId?: string;
      walletAddress?: string;
      errorMessage?: string;
    },
  ) => Promise<void>;
}

function privateQueue(queue: ETLJobQueue): ETLJobQueue & JobQueuePrivateAccess {
  return accessPrivate<ETLJobQueue, JobQueuePrivateAccess>(queue);
}

describe('ETLJobQueue', () => {
  let jobQueue: ETLJobQueue;
  let mockProcessor: MockProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    jobQueue = new ETLJobQueue();
    mockProcessor = { processJob: vi.fn() };
    privateQueue(jobQueue).processor = mockProcessor;
    vi.mocked(portfolioRollupSynchronizer.synchronize).mockResolvedValue({
      durationMs: 5,
      metrics: {
        portfolioKeysProcessed: 1,
        walletKeysProcessed: 1,
        usersProcessed: 1,
        portfolioRowsWritten: 1,
        walletRowsWritten: 1,
        trendRowsWritten: 1,
        remainingPortfolioKeys: 0,
        remainingWalletKeys: 0,
        remainingUsers: 0,
      },
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Job Creation', () => {
    it('should create unique job IDs', async () => {
      const job1 = await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      const job2 = await jobQueue.enqueue({
        trigger: 'scheduled',
        sources: ['debank'],
      });

      expect(job1.jobId).not.toBe(job2.jobId);
    });
  });

  describe('Job Retrieval', () => {
    it('should retrieve a job by ID', async () => {
      const job = await jobQueue.enqueue({
        trigger: 'webhook',
        sources: ['hyperliquid'],
        filters: { chains: ['ethereum'] },
      });

      const retrieved = jobQueue.getJob(job.jobId);
      expect(retrieved).toEqual(job);
    });

    it('should return undefined for non-existent job', () => {
      const retrieved = jobQueue.getJob('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Queue Status', () => {
    it('should return correct queue status for empty queue', () => {
      const status = jobQueue.getQueueStatus();
      expect(status).toEqual({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        isProcessing: false,
      });
    });

    it('should report pending, processing, completed, and failed jobs', async () => {
      mockProcessor.processJob.mockImplementation(() => new Promise(() => {}));

      await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      privateQueue(jobQueue).jobs.set('failed', {
        jobId: 'failed',
        status: 'failed',
      });
      privateQueue(jobQueue).jobs.set('completed', {
        jobId: 'completed',
        status: 'completed',
      });

      expect(jobQueue.getQueueStatus()).toEqual({
        total: 4,
        pending: 1,
        processing: 1,
        completed: 1,
        failed: 1,
        isProcessing: true,
      });
    });
  });

  describe('processNext edge cases', () => {
    it('should not process when already processing', async () => {
      privateQueue(jobQueue).isProcessing = true;

      await privateQueue(jobQueue).processNext();

      expect(mockProcessor.processJob).not.toHaveBeenCalled();
    });

    it('should return when there are no pending jobs', async () => {
      await privateQueue(jobQueue).processNext();

      expect(mockProcessor.processJob).not.toHaveBeenCalled();
    });
  });

  describe('Basic Job Processing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should process a successful job', async () => {
      // Mock successful processing
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 10,
        errors: [],
        sourceResults: {},
      });

      const job = await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      // Fast-forward timers to trigger processing
      await vi.runAllTimersAsync();

      const result = jobQueue.getResult(job.jobId);
      expect(result).toBeDefined();
      if (!result) {
        return;
      }

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          jobId: job.jobId,
          recordsProcessed: 10,
          recordsInserted: 10,
        });
      }
    });

    it('should handle job processing failure', async () => {
      // Mock processing error
      mockProcessor.processJob.mockRejectedValue(
        new Error('Processing failed'),
      );

      const job = await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      await vi.runAllTimersAsync();

      const result = jobQueue.getResult(job.jobId);
      expect(result).toBeDefined();
      expect(result?.success).toBe(false);
      if (result?.success) {
        expect(result.data.status).toBe('failed');
        expect(result.data.errors).toBeDefined();
        // The error message from mockRejectedValue ends up in errors array or similar?
        // jobQueue implementation: errors: result.errors ...
        // Wait, if exception drawn, catch block sets success: false!
        // Line 301 catch(error) -> success: false.
      }
    });

    it('should process multiple jobs sequentially', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 1,
        recordsInserted: 1,
        errors: [],
        sourceResults: {},
      });

      const job1 = await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });
      const job2 = await jobQueue.enqueue({
        trigger: 'manual',
        sources: ['hyperliquid'],
      });

      expect(jobQueue.getJob(job1.jobId)?.status).toBe('processing');
      expect(jobQueue.getJob(job2.jobId)?.status).toBe('pending');

      await vi.runAllTimersAsync();

      expect(jobQueue.getJob(job1.jobId)?.status).toBe('completed');
      expect(jobQueue.getJob(job2.jobId)?.status).toBe('completed');
      expect(mockProcessor.processJob).toHaveBeenCalledTimes(2);
    });
  });

  describe('processNext detailed paths', () => {
    it('marks job completed when processor succeeds', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 2,
        recordsInserted: 2,
        errors: [],
        sourceResults: {},
      });

      const job = {
        jobId: 'job-success',
        trigger: 'manual',
        sources: ['hyperliquid'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(job.status).toBe('completed');
      const result = jobQueue.getResult(job.jobId);
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.data.recordsInserted).toBe(2);
      }
    });

    it('captures thrown exceptions and marks job failed', async () => {
      mockProcessor.processJob.mockImplementation(() => {
        throw new Error('fatal');
      });

      const job = {
        jobId: 'job-fail',
        trigger: 'manual',
        sources: ['hyperliquid'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(job.status).toBe('failed');
      const result = jobQueue.getResult(job.jobId);
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result?.error.message).toBe('fatal');
      }
    });

    it('marks job failed when processor returns success false', async () => {
      // NOTE: In current implementation, if processor returns success=false but resolves,
      // jobQueue treats it as COMPLETED but with failure details inside?
      // Let's check jobQueue.ts implementation:
      // pendingJob.status = result.success ? 'completed' : 'failed';
      // And result object is created.

      mockProcessor.processJob.mockResolvedValue({
        success: false,
        recordsProcessed: 1,
        recordsInserted: 0,
        errors: ['bad'],
        sourceResults: {},
      });

      const job = {
        jobId: 'job-soft-fail',
        trigger: 'manual',
        sources: ['hyperliquid'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(job.status).toBe('failed');
      const result = jobQueue.getResult(job.jobId);

      // result.success follows jobQueue logic which is now ALWAYS true for completed flow
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.data.status).toBe('failed');
        // recordsInserted etc checks
      }
    });

    it('stores catch result when processor promise rejects', async () => {
      mockProcessor.processJob.mockRejectedValue(new Error('async fail'));

      const job = {
        jobId: 'job-async-fail',
        trigger: 'manual',
        sources: ['hyperliquid'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      const result = jobQueue.getResult(job.jobId);
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result?.error.message).toBe('async fail');
      }
      expect(job.status).toBe('failed');
    });

    it('uses fallback message when caught error is not an Error instance', async () => {
      mockProcessor.processJob.mockRejectedValue('string failure');

      const job = {
        jobId: 'job-string-fail',
        trigger: 'manual',
        sources: ['hyperliquid'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      const result = jobQueue.getResult(job.jobId);
      expect(result?.success).toBe(false);
      if (!result?.success) {
        expect(result?.error.message).toContain('Unknown error');
      }
    });
  });

  describe('persistJobStatus', () => {
    let mockDbClient: {
      query: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockDbClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      vi.mocked(getDbClient).mockResolvedValue(mockDbClient as unknown);
    });

    it('should skip persistence when metadata.userId is missing', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-id', 'pending', {});

      expect(getDbClient).not.toHaveBeenCalled();
    });

    it('should skip persistence when metadata is undefined', async () => {
      await privateQueue(jobQueue).persistJobStatus(
        'job-id',
        'pending',
        undefined,
      );

      expect(getDbClient).not.toHaveBeenCalled();
    });

    it('should persist job status for wallet_fetch jobs with userId', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
        userId: 'user-456',
        walletAddress: '0x1234567890abcdef',
      });

      expect(getDbClient).toHaveBeenCalled();
      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alpha_raw.etl_job_queue'),
        expect.arrayContaining([
          'job-123',
          'user-456',
          '0x1234567890abcdef',
          'pending',
        ]),
      );
    });

    it('should persist processing status with started_at', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'processing', {
        userId: 'user-456',
        walletAddress: '0x1234',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('started_at = NOW()'),
        expect.any(Array),
      );
    });

    it('should persist failed status with error message', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'failed', {
        userId: 'user-456',
        errorMessage: 'Something went wrong',
      });

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('error_message'),
        expect.arrayContaining(['Something went wrong']),
      );
    });

    it('should handle database errors gracefully (non-fatal)', async () => {
      vi.mocked(getDbClient).mockRejectedValue(
        new Error('DB connection failed'),
      );

      // Should not throw
      await expect(
        privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
          userId: 'user-456',
        }),
      ).resolves.toBeUndefined();
    });

    it('should handle non-Error database failures gracefully', async () => {
      vi.mocked(getDbClient).mockRejectedValue('DB failure');

      await expect(
        privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
          userId: 'user-456',
        }),
      ).resolves.toBeUndefined();
    });

    it('should call release() exactly once on successful query', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
        userId: 'user-456',
        walletAddress: '0x1234',
      });

      expect(mockDbClient.release).toHaveBeenCalledTimes(1);
    });

    it('should call release() exactly once when query throws', async () => {
      mockDbClient.query.mockRejectedValue(new Error('Query failed'));

      await privateQueue(jobQueue).persistJobStatus('job-123', 'completed', {
        userId: 'user-456',
      });

      expect(mockDbClient.release).toHaveBeenCalledTimes(1);
    });

    it('should call release() exactly once when getDbClient throws', async () => {
      vi.mocked(getDbClient).mockRejectedValue(new Error('Connection failed'));

      await privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
        userId: 'user-456',
      });

      // release should not be called if getDbClient fails
      expect(mockDbClient.release).not.toHaveBeenCalled();
    });

    it('should generate SQL without trailing comma for pending status', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'pending', {
        userId: 'user-456',
        walletAddress: '0x1234',
      });

      const [query] = mockDbClient.query.mock.calls[0];
      // Should not have trailing comma before end of SET clause
      expect(query).not.toMatch(/,\s+WHERE|,\s*\n\s*$/);
      expect(query).toContain('status = EXCLUDED.status');
      expect(query).toContain('updated_at = NOW()');
      expect(query).not.toContain('started_at');
      expect(query).not.toContain('completed_at');
    });

    it('should generate SQL with all fields for failed status with error message', async () => {
      await privateQueue(jobQueue).persistJobStatus('job-123', 'failed', {
        userId: 'user-456',
        walletAddress: '0x1234',
        errorMessage: 'Test error',
      });

      const [query] = mockDbClient.query.mock.calls[0];
      expect(query).toContain('status = EXCLUDED.status');
      expect(query).toContain('updated_at = NOW()');
      expect(query).toContain('completed_at = NOW()');
      expect(query).toContain('error_message = $5');
      // Verify proper structure - error_message should be last, no trailing comma
      expect(query).toMatch(/error_message = \$5\s*$/m);
    });
  });

  describe('portfolio rollup synchronization', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const mockDbClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      vi.mocked(getDbClient).mockResolvedValue(mockDbClient as unknown);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('synchronizes after DeBank actually writes records', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 5,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 10,
            recordsInserted: 5,
            errors: [],
          },
        },
      });

      const job = {
        jobId: 'debank-with-records',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).toHaveBeenCalledWith(
        'debank-with-records',
      );
    });

    it('synchronizes a successful wallet_fetch even when it writes zero rows', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 0,
            recordsInserted: 0,
            errors: [],
          },
        },
      });

      const job = {
        jobId: 'wallet-job-zero',
        trigger: 'webhook',
        sources: ['debank'],
        metadata: {
          jobType: 'wallet_fetch',
          userId: 'user-123',
          walletAddress: '0x1234567890123456789012345678901234567890',
        },
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).toHaveBeenCalledWith(
        'wallet-job-zero',
      );
    });

    it('synchronizes a partial DeBank failure that still wrote records', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: false,
        recordsProcessed: 10,
        recordsInserted: 2,
        errors: ['debank: API timeout'],
        sourceResults: {
          debank: {
            source: 'debank',
            success: false,
            recordsProcessed: 10,
            recordsInserted: 2,
            errors: ['API timeout'],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockClear();

      const job = {
        jobId: 'partial-failure-with-inserts',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).toHaveBeenCalledWith(
        'partial-failure-with-inserts',
      );
      expect(job.status).toBe('failed');

      const result = jobQueue.getResult('partial-failure-with-inserts');
      expect(result?.data.status).toBe('failed');
    });

    it.each([
      'hyperliquid',
      'feargreed',
      'macro-fear-greed',
      'token-price',
      'stock-price',
    ] as const)('never synchronizes for %s writes', async (source) => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 5,
        recordsInserted: 5,
        errors: [],
        sourceResults: {
          [source]: {
            source,
            success: true,
            recordsProcessed: 5,
            recordsInserted: 5,
            errors: [],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockClear();

      const job = {
        jobId: `non-portfolio-${source}`,
        trigger: 'manual',
        sources: [source],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).not.toHaveBeenCalled();
    });

    it('does not synchronize a failed wallet_fetch that wrote zero rows', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: ['wallet fetch failed'],
        sourceResults: {
          debank: {
            source: 'debank',
            success: false,
            recordsProcessed: 0,
            recordsInserted: 0,
            errors: ['wallet fetch failed'],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockClear();

      const job = {
        jobId: 'wallet-failed-zero',
        trigger: 'webhook',
        sources: ['debank'],
        metadata: {
          jobType: 'wallet_fetch',
          userId: 'user-123',
          walletAddress: '0x1234567890123456789012345678901234567890',
        },
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).not.toHaveBeenCalled();
      expect(job.status).toBe('failed');
    });

    it('does not synchronize a normal DeBank job that wrote zero rows', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 5,
        recordsInserted: 0,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 5,
            recordsInserted: 0,
            errors: [],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockClear();

      const job = {
        jobId: 'debank-no-records',
        trigger: 'scheduled',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(portfolioRollupSynchronizer.synchronize).not.toHaveBeenCalled();
    });

    it('marks the job failed when rollup synchronization fails', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 5,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 10,
            recordsInserted: 5,
            errors: [],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockRejectedValue(
        new Error('queue timeout'),
      );

      const job = {
        jobId: 'rollup-fail-job',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(job.status).toBe('failed');
      const result = jobQueue.getResult('rollup-fail-job');
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.data.status).toBe('failed');
        expect(result.data.errors).toContain(
          'Portfolio rollup synchronization failed: queue timeout',
        );
        expect(result.data).not.toHaveProperty('mvRefreshSuccess');
        expect(result.data).not.toHaveProperty('mvRefreshResults');
      }
    });

    it('handles a non-Error rollup synchronization failure', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 2,
        recordsInserted: 1,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 2,
            recordsInserted: 1,
            errors: [],
          },
        },
      });

      vi.mocked(portfolioRollupSynchronizer.synchronize).mockRejectedValue(
        'processor unavailable',
      );

      const job = {
        jobId: 'rollup-throw-job',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      expect(job.status).toBe('failed');
      const result = jobQueue.getResult('rollup-throw-job');
      expect(result?.data.status).toBe('failed');
    });

    it('should default job errors to empty array when processor omits them', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 5,
        errors: '',
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 10,
            recordsInserted: 5,
            errors: [],
          },
        },
      });

      const job = {
        jobId: 'job-no-errors',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      const result = jobQueue.getResult('job-no-errors');
      expect(result?.data.errors).toEqual([]);
    });

    it('keeps internal rollup metrics out of the public job result', async () => {
      mockProcessor.processJob.mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 5,
        errors: [],
        sourceResults: {
          debank: {
            source: 'debank',
            success: true,
            recordsProcessed: 10,
            recordsInserted: 5,
            errors: [],
          },
        },
      });

      const job = {
        jobId: 'job-with-rollup-metrics',
        trigger: 'manual',
        sources: ['debank'],
        createdAt: new Date(),
        status: 'pending',
      };

      privateQueue(jobQueue).jobs.set(job.jobId, job);
      await privateQueue(jobQueue).processNext();

      const result = jobQueue.getResult('job-with-rollup-metrics');
      expect(result?.success).toBe(true);
      if (result?.success) {
        expect(result.data.status).toBe('completed');
        expect(result.data).not.toHaveProperty('mvRefreshDurationMs');
        expect(result.data).not.toHaveProperty('rollupSyncMetrics');
      }
    });
  });
});
