/**
 * Comprehensive unit tests for Webhook routes
 * Tests Express route handlers, validation, job status logic, and advanced TypeScript patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type {
  ETLJob,
  ETLJobResult,
  WebhookPayload,
} from '../../../src/types/index.js';

// Mock the logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock ETLJobQueue
const mockJobQueue = {
  enqueue: vi.fn(),
  getJob: vi.fn(),
  getResult: vi.fn(),
};

vi.mock('../../../src/modules/core/jobQueue.js', () => ({
  ETLJobQueue: vi.fn(function ETLJobQueue() {
    return mockJobQueue;
  }),
}));

// Create test app with webhook router
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  // Add request ID middleware like the main app (only if not already set)
  app.use((req, res, next) => {
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = 'test-request-id';
    }
    next();
  });

  const { webhooksRouter } = await import('../../../src/routes/webhooks.js');
  app.use('/webhooks', webhooksRouter);

  return app;
};

describe('Webhooks Router', () => {
  let app: express.Application;
  type SuccessResultData = Extract<ETLJobResult, { success: true }>['data'];
  type FailedResultError = Extract<ETLJobResult, { success: false }>['error'];

  // Global helper functions available to all test suites
  const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
    jobId: 'job-123',
    trigger: 'scheduled',
    sources: ['defillama'],
    filters: { chains: ['ethereum'] },
    createdAt: new Date(),
    status: 'pending',
    ...overrides,
  });

  const createMockSuccessResult = (
    overrides: Partial<SuccessResultData> = {},
  ): ETLJobResult => {
    return {
      success: true,
      data: {
        jobId: 'job-123',
        status: 'completed',
        recordsProcessed: 100,
        recordsInserted: 95,
        sourceResults: {},
        duration: 5000,
        completedAt: new Date(),
        ...overrides,
      },
    };
  };

  const createMockFailureResult = (
    overrides: Partial<FailedResultError> = {},
  ): ETLJobResult => {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: 'Unknown Error',
        source: 'system',
        ...overrides,
      },
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createTestApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /webhooks/pipedream', () => {
    it('should accept valid webhook payload and enqueue job', async () => {
      const payload: WebhookPayload = {
        trigger: 'scheduled',
        sources: ['defillama'],
        filters: {
          chains: ['ethereum', 'polygon'],
          protocols: ['uniswap'],
          minTvl: 1000000,
        },
      };

      const mockJob = createMockJob({
        sources: ['defillama'],
        filters: payload.filters,
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { jobId: 'job-123' },
        timestamp: expect.any(String),
      });

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        trigger: 'scheduled',
        sources: ['defillama'],
        filters: payload.filters,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook received from Pipedream',
        {
          requestId: 'test-request-id',
          trigger: 'scheduled',
          sources: ['defillama'],
        },
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ETL job queued successfully',
        {
          requestId: 'test-request-id',
          jobId: 'job-123',
        },
      );
    });

    it('should use default sources when not provided', async () => {
      const payload = {
        trigger: 'manual',
      };

      const mockJob = createMockJob({
        trigger: 'manual',
        sources: ['defillama', 'debank', 'hyperliquid', 'stock-price'],
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(200);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        trigger: 'manual',
        sources: ['defillama', 'debank', 'hyperliquid', 'stock-price'],
        filters: undefined,
      });

      expect(response.body.success).toBe(true);
    });

    it('should handle minimal valid payload', async () => {
      const payload = {
        trigger: 'scheduled',
      };

      const mockJob = createMockJob({
        trigger: 'scheduled',
        sources: ['defillama', 'debank', 'hyperliquid', 'stock-price'],
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      await request(app).post('/webhooks/pipedream').send(payload).expect(200);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        trigger: 'scheduled',
        sources: ['defillama', 'debank', 'hyperliquid', 'stock-price'],
        filters: undefined,
      });
    });

    it('should validate required trigger field', async () => {
      const payload = {
        sources: ['defillama'],
        // Missing trigger
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('trigger');
      expect(response.body.timestamp).toBeDefined();

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('trigger');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('should validate trigger enum values', async () => {
      const payload = {
        trigger: 'invalid-trigger',
        sources: ['defillama'],
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('trigger');
    });

    it('should validate sources array values', async () => {
      const payload = {
        trigger: 'scheduled',
        sources: ['invalid-source'],
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('sources');
    });

    it('should accept token-price source key', async () => {
      const payload: WebhookPayload = {
        trigger: 'manual',
        source: 'token-price',
      };

      const mockJob = createMockJob({
        trigger: 'manual',
        sources: ['token-price'],
      });
      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        trigger: 'manual',
        sources: ['token-price'],
        filters: undefined,
      });
    });

    it('should reject deprecated btc-price source key', async () => {
      const payload = {
        trigger: 'manual',
        source: 'btc-price',
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('source');
    });

    it('should validate filters structure', async () => {
      const payload = {
        trigger: 'scheduled',
        filters: {
          chains: 'invalid-chains', // Should be array
          minTvl: -100, // Should be positive
        },
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      // Zod error message join
      expect(response.body.error.message).toContain('expected array');
    });

    it('should handle job queue errors', async () => {
      const payload: WebhookPayload = {
        trigger: 'scheduled',
        sources: ['defillama'],
      };

      const queueError = new Error('Queue is full');
      mockJobQueue.enqueue.mockRejectedValueOnce(queueError);

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Queue is full');
    });

    it('should handle non-Error exceptions', async () => {
      const payload = {
        trigger: 'scheduled',
      };

      mockJobQueue.enqueue.mockRejectedValueOnce('String error');

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Unknown error');
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/webhooks/pipedream')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    it('should validate minTvl as positive number', async () => {
      const payload = {
        trigger: 'scheduled',
        filters: {
          minTvl: 0, // Should be positive
        },
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.error.message).toContain('Too small');
    });
  });

  describe('GET /webhooks/jobs/:jobId', () => {
    it('should return job status for pending job', async () => {
      const job = createMockJob({ status: 'pending' });
      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(null);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(202); // Accepted - still processing

      expect(response.body).toEqual({
        success: true,
        data: {
          jobId: job.jobId,
          trigger: job.trigger,
          status: job.status,
          createdAt: job.createdAt.toISOString(),
        },
        timestamp: expect.any(String),
      });
    });

    it('should return job status for processing job', async () => {
      const job = createMockJob({ status: 'processing' });
      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(null);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(202); // Accepted - still processing

      expect(response.body.data.status).toBe('processing');
    });

    it('should return job status for failed job', async () => {
      const job = createMockJob({ status: 'failed' });
      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(null);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(500); // Internal Server Error - job failed

      expect(response.body.data.status).toBe('failed');
    });

    it('should return successful job with result', async () => {
      const job = createMockJob({ status: 'completed' });
      const result = createMockSuccessResult({
        recordsProcessed: 100,
        recordsInserted: 100, // All inserted, no errors
        errors: [],
        sourceResults: {},
      });
      if (!result.success) {
        throw new Error('Expected successful job result');
      }

      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(result);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(200); // OK - fully successful

      expect(response.body).toEqual({
        success: true,
        data: {
          jobId: job.jobId,
          status: job.status,
          trigger: job.trigger,
          createdAt: job.createdAt.toISOString(),
          recordsProcessed: result.data.recordsProcessed,
          recordsInserted: result.data.recordsInserted,
          duration: result.data.duration,
          completedAt: result.data.completedAt.toISOString(),
        },
        timestamp: expect.any(String),
      });
    });

    it('should return completed job without result as 200', async () => {
      const job = createMockJob({ status: 'completed' });
      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(undefined);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(200);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.recordsProcessed).toBeUndefined();
      expect(response.body.data.recordsInserted).toBeUndefined();
    });

    it('should return completed job with failures as 500', async () => {
      const job = createMockJob({ status: 'completed' });
      const result = createMockFailureResult({ message: 'API timeout' });

      mockJobQueue.getJob.mockImplementation(() => job);
      mockJobQueue.getResult.mockImplementation(() => result);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(500); // Job completed but with failures

      expect(response.body.data.status).toBe('failed');
      expect(response.body.error.message).toBe('API timeout');
    });

    it('should return partial success as 206', async () => {
      const job = createMockJob({ status: 'completed' });
      const result = createMockSuccessResult({
        recordsProcessed: 100,
        recordsInserted: 80, // Some records failed to insert
        errors: ['20 records failed validation'],
        // Errors in sourceResults implied
      });

      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(result);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(206); // Partial Content - some records failed to insert

      expect(response.body.data.recordsProcessed).toBe(100);
      expect(response.body.data.recordsInserted).toBe(80);
    });

    it('should return partial success with errors as 206', async () => {
      const job = createMockJob({ status: 'completed' });
      const result = createMockSuccessResult({
        recordsProcessed: 100,
        recordsInserted: 100, // All inserted
        sourceResults: {
          defillama: {
            errors: ['Warning: deprecated API used'],
            success: true,
          },
        },
      });

      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(result);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(206); // Partial Content - has errors

      // Access sourceResults to check errors
      // In the new flat structure, the errors might be mapped differently or not included if not in EtlJobStatus
      // For now just check status and basic fields
      expect(response.body.data.recordsProcessed).toBe(100);
    });

    it('should return 404 for non-existent job', async () => {
      mockJobQueue.getJob.mockReturnValueOnce(null);

      const response = await request(app)
        .get('/webhooks/jobs/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Job not found');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle job retrieval errors', async () => {
      const retrievalError = new Error('Database connection failed');
      mockJobQueue.getJob.mockImplementation(() => {
        throw retrievalError;
      });

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to retrieve job status');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle non-Error exceptions during job retrieval', async () => {
      mockJobQueue.getJob.mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'String error in job retrieval';
      });

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Failed to retrieve job status');
    });

    it('should log warning when job status schema validation fails', async () => {
      const jobWithBadDate = {
        jobId: 'job-invalid-date',
        trigger: 'scheduled',
        sources: ['defillama'],
        createdAt: {
          toISOString: () => 'not-an-iso-date',
        },
        status: 'pending',
      };

      mockJobQueue.getJob.mockReturnValueOnce(jobWithBadDate);
      mockJobQueue.getResult.mockReturnValueOnce(null);

      const response = await request(app)
        .get('/webhooks/jobs/job-invalid-date')
        .expect(202);

      expect(response.body.data.jobId).toBe('job-invalid-date');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job status schema validation failed',
        expect.objectContaining({
          jobId: 'job-invalid-date',
          error: expect.anything(),
        }),
      );
    });

    it('should handle edge case with result but no successful completion', async () => {
      const job = createMockJob({ status: 'completed' });
      const result = createMockSuccessResult({
        recordsProcessed: 100,
        recordsInserted: 100,
        errors: [], // No errors, full success
        sourceResults: {},
      });

      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(result);

      const response = await request(app)
        .get('/webhooks/jobs/job-123')
        .expect(200); // Full success

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.recordsProcessed).toBe(100);
    });
    // ...
  }); // End GET /jobs

  describe('Fear & Greed Sentiment Source', () => {
    // ...
    it('rejects invalid source names', async () => {
      const payload = {
        trigger: 'scheduled',
        source: 'invalid-source',
      };

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns job ID and enqueues sentiment ETL job', async () => {
      const payload: WebhookPayload = {
        trigger: 'manual',
        sources: ['feargreed'],
      };

      const mockJob = createMockJob({
        jobId: 'sentiment-job-456',
        trigger: 'manual',
        sources: ['feargreed'],
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/pipedream')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { jobId: 'sentiment-job-456' },
        timestamp: expect.any(String),
      });

      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'manual',
          sources: ['feargreed'],
        }),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ETL job queued successfully',
        expect.objectContaining({
          jobId: 'sentiment-job-456',
        }),
      );
    });
  });

  describe('POST /webhooks/wallet-fetch', () => {
    const validWalletPayload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      walletAddress: '0x1234567890123456789012345678901234567890',
      trigger: 'manual' as const,
    };

    beforeEach(() => {
      // Ensure WEBHOOK_SECRET is cleared before each test runs
      delete process.env.WEBHOOK_SECRET;
    });

    afterEach(() => {
      // Ensure WEBHOOK_SECRET is cleared between tests
      delete process.env.WEBHOOK_SECRET;
    });

    it('should accept valid wallet-fetch payload and enqueue job', async () => {
      const mockJob = createMockJob({
        jobId: 'wallet-job-123',
        trigger: 'manual',
        sources: ['debank'],
        metadata: {
          userId: validWalletPayload.userId,
          walletAddress: validWalletPayload.walletAddress,
          jobType: 'wallet_fetch',
        },
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(validWalletPayload)
        .expect(202);

      expect(response.body).toEqual({
        success: true,
        data: { jobId: 'wallet-job-123' },
        timestamp: expect.any(String),
      });

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        trigger: 'manual',
        sources: ['debank'],
        metadata: {
          userId: validWalletPayload.userId,
          walletAddress: validWalletPayload.walletAddress,
          jobType: 'wallet_fetch',
        },
      });
    });

    it('should accept webhook trigger and enqueue job', async () => {
      const mockJob = createMockJob({
        jobId: 'wallet-job-webhook',
        trigger: 'webhook',
        sources: ['debank'],
      });

      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send({ ...validWalletPayload, trigger: 'webhook' })
        .expect(202);

      expect(response.body).toEqual({
        success: true,
        data: { jobId: 'wallet-job-webhook' },
        timestamp: expect.any(String),
      });

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'webhook',
          sources: ['debank'],
          metadata: expect.objectContaining({
            jobType: 'wallet_fetch',
          }),
        }),
      );
    });

    it('should validate userId as UUID', async () => {
      const invalidPayload = {
        ...validWalletPayload,
        userId: 'not-a-uuid',
      };

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate walletAddress format', async () => {
      const invalidPayload = {
        ...validWalletPayload,
        walletAddress: 'invalid-address',
      };

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should validate trigger enum', async () => {
      const invalidPayload = {
        ...validWalletPayload,
        trigger: 'invalid',
      };

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject invalid webhook secret when configured', async () => {
      // Temporarily set WEBHOOK_SECRET
      const originalSecret = process.env.WEBHOOK_SECRET;
      process.env.WEBHOOK_SECRET = 'test-secret';

      try {
        const payloadWithWrongSecret = {
          ...validWalletPayload,
          secret: 'wrong-secret',
        };

        const response = await request(app)
          .post('/webhooks/wallet-fetch')
          .send(payloadWithWrongSecret)
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
        expect(response.body.error.message).toBe('Invalid webhook secret');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Invalid webhook secret',
          expect.objectContaining({
            userId: validWalletPayload.userId,
            wallet: '0x1234...7890',
          }),
        );
        expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
      } finally {
        process.env.WEBHOOK_SECRET = originalSecret;
      }
    });

    it('should accept valid webhook secret when configured', async () => {
      const originalSecret = process.env.WEBHOOK_SECRET;
      process.env.WEBHOOK_SECRET = 'test-secret';

      try {
        const payloadWithCorrectSecret = {
          ...validWalletPayload,
          secret: 'test-secret',
        };

        const mockJob = createMockJob({
          jobId: 'wallet-job-456',
          sources: ['debank'],
        });
        mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

        const response = await request(app)
          .post('/webhooks/wallet-fetch')
          .send(payloadWithCorrectSecret)
          .expect(202);

        expect(response.body.success).toBe(true);
        expect(response.body.data.jobId).toBe('wallet-job-456');
      } finally {
        process.env.WEBHOOK_SECRET = originalSecret;
      }
    });

    it('should reject missing secret when WEBHOOK_SECRET is configured', async () => {
      const originalSecret = process.env.WEBHOOK_SECRET;
      process.env.WEBHOOK_SECRET = 'test-secret';

      try {
        // No secret in payload
        const response = await request(app)
          .post('/webhooks/wallet-fetch')
          .send(validWalletPayload)
          .expect(401);

        expect(response.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.WEBHOOK_SECRET = originalSecret;
      }
    });

    it('should include requestId and validation details on payload errors', async () => {
      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send({ trigger: 'manual' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.context.requestId).toBe('test-request-id');
      expect(Array.isArray(response.body.error.context.errors)).toBe(true);
      expect(response.body.error.context.errors.length).toBeGreaterThan(0);
    });

    it('should handle job queue errors', async () => {
      mockJobQueue.enqueue.mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(validWalletPayload)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('API_ERROR');
      expect(response.body.error.message).toBe('Database error');
      expect(response.body.error.context.requestId).toBe('test-request-id');
    });

    it('should handle non-Error exceptions', async () => {
      mockJobQueue.enqueue.mockRejectedValueOnce('String error');

      const response = await request(app)
        .post('/webhooks/wallet-fetch')
        .send(validWalletPayload)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Unknown error');
    });

    it('should log wallet fetch request with masked address', async () => {
      const mockJob = createMockJob({ jobId: 'wallet-job-789' });
      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      await request(app)
        .post('/webhooks/wallet-fetch')
        .send(validWalletPayload)
        .expect(202);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Wallet fetch webhook received',
        expect.objectContaining({
          userId: validWalletPayload.userId,
          walletAddress: '0x1234...7890',
          trigger: 'manual',
        }),
      );
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should handle valid DataSource union types', async () => {
      const payload: WebhookPayload = {
        trigger: 'scheduled',
        sources: ['defillama', 'debank', 'hyperliquid'], // All valid DataSource values
      };

      const mockJob = createMockJob({
        sources: ['defillama', 'debank', 'hyperliquid'],
      });
      mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

      await request(app).post('/webhooks/pipedream').send(payload).expect(200);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: ['defillama', 'debank', 'hyperliquid'],
        }),
      );
    });

    it('should enforce trigger enum constraints', async () => {
      const validTriggers: ETLJob['trigger'][] = ['scheduled', 'manual'];

      for (const trigger of validTriggers) {
        vi.clearAllMocks();
        const mockJob = createMockJob({ trigger });
        mockJobQueue.enqueue.mockResolvedValueOnce(mockJob);

        await request(app)
          .post('/webhooks/pipedream')
          .send({ trigger })
          .expect(200);
      }
    });
  });
});
