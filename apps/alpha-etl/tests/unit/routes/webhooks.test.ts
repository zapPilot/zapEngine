import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ETLJob, ETLJobResult } from '../../../src/types/index.js';

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

const mockJobQueue = {
  enqueue: vi.fn(),
  getJob: vi.fn(),
  getResult: vi.fn(),
};

vi.mock('../../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../src/modules/core/jobQueueSingleton.js', () => ({
  etlJobQueue: mockJobQueue,
}));

const allSources = [
  'defillama',
  'debank',
  'hyperliquid',
  'feargreed',
  'macro-fear-greed',
  'token-price',
  'stock-price',
];

async function createTestApp(): Promise<express.Application> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['x-request-id'] = 'test-request-id';
    next();
  });

  const { webhooksRouter } = await import('../../../src/routes/webhooks.js');
  app.use('/webhooks', webhooksRouter);
  return app;
}

describe('Webhooks Router', () => {
  let app: express.Application;

  const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
    jobId: 'job-123',
    sources: ['defillama'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    status: 'pending',
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockJobQueue.enqueue.mockResolvedValue(createMockJob());
    mockJobQueue.getJob.mockReturnValue(undefined);
    mockJobQueue.getResult.mockReturnValue(undefined);
    app = await createTestApp();
  });

  describe('POST /webhooks/jobs', () => {
    it('queues all current sources for an empty payload', async () => {
      const response = await request(app).post('/webhooks/jobs').send({});

      expect(response.status).toBe(202);
      expect(response.body.data.jobId).toBe('job-123');
      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: allSources,
        tasks: allSources.map((source) => ({ source, operation: 'current' })),
        filters: undefined,
      });
    });

    it('queues a current-source subset sequentially as tasks', async () => {
      await request(app)
        .post('/webhooks/jobs')
        .send({ sources: ['hyperliquid', 'debank'] })
        .expect(202);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: ['hyperliquid', 'debank'],
        tasks: [
          { source: 'hyperliquid', operation: 'current' },
          { source: 'debank', operation: 'current' },
        ],
        filters: undefined,
      });
    });

    it('queues explicit backfill tasks', async () => {
      const task = {
        source: 'token-price',
        operation: 'backfill',
        tokens: [
          { tokenId: 'bitcoin', tokenSymbol: 'BTC', daysBack: 3 },
          { tokenId: 'ethereum', tokenSymbol: 'ETH', daysBack: 3 },
        ],
      };

      await request(app)
        .post('/webhooks/jobs')
        .send({ tasks: [task] })
        .expect(202);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: ['token-price'],
        tasks: [task],
        filters: undefined,
      });
    });

    it('rejects ambiguous sources plus tasks payloads', async () => {
      const response = await request(app)
        .post('/webhooks/jobs')
        .send({
          sources: ['debank'],
          tasks: [{ source: 'token-price', operation: 'backfill', tokens: [] }],
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('tasks');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('does not require trigger and ignores old trigger metadata', async () => {
      await request(app)
        .post('/webhooks/jobs')
        .send({ trigger: 'scheduled', source: 'feargreed' })
        .expect(202);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: ['feargreed'],
        tasks: [{ source: 'feargreed', operation: 'current' }],
        filters: undefined,
      });
    });
  });

  describe('POST /webhooks/pipedream', () => {
    it('adapts old Pipedream payloads to the queued job API', async () => {
      await request(app)
        .post('/webhooks/pipedream')
        .send({ trigger: 'manual', sources: ['hyperliquid'] })
        .expect(202);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: ['hyperliquid'],
        tasks: [{ source: 'hyperliquid', operation: 'current' }],
        filters: undefined,
      });
    });
  });

  describe('POST /webhooks/wallet-fetch', () => {
    it('queues wallet fetch without a trigger field', async () => {
      await request(app)
        .post('/webhooks/wallet-fetch')
        .send({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          walletAddress: '0x1234567890123456789012345678901234567890',
        })
        .expect(202);

      expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
        sources: ['debank'],
        metadata: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          walletAddress: '0x1234567890123456789012345678901234567890',
          jobType: 'wallet_fetch',
        },
      });
    });
  });

  describe('GET /webhooks/jobs/:jobId', () => {
    it('returns job status without trigger', async () => {
      const job = createMockJob({ status: 'completed' });
      const result: ETLJobResult = {
        success: true,
        data: {
          jobId: 'job-123',
          status: 'completed',
          recordsProcessed: 1,
          recordsInserted: 1,
          sourceResults: {},
          duration: 100,
          completedAt: new Date('2024-01-01T00:00:01Z'),
        },
      };
      mockJobQueue.getJob.mockReturnValueOnce(job);
      mockJobQueue.getResult.mockReturnValueOnce(result);

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        jobId: 'job-123',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00.000Z',
        recordsProcessed: 1,
        recordsInserted: 1,
        duration: 100,
        completedAt: '2024-01-01T00:00:01.000Z',
      });
      expect(response.body.data.trigger).toBeUndefined();
    });
  });

  describe('POST /webhooks/jobs error envelopes', () => {
    it('returns 400 with VALIDATION_ERROR envelope and zod issues on bad payload', async () => {
      const response = await request(app)
        .post('/webhooks/jobs')
        .send({
          sources: ['debank'],
          tasks: [{ source: 'token-price', operation: 'backfill', tokens: [] }],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.context.requestId).toBe('test-request-id');
      expect(Array.isArray(response.body.error.context.errors)).toBe(true);
      expect(response.body.error.context.errors.length).toBeGreaterThan(0);
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns 500 with API_ERROR envelope when enqueue throws', async () => {
      mockJobQueue.enqueue.mockRejectedValueOnce(new Error('db down'));

      const response = await request(app).post('/webhooks/jobs').send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('API_ERROR');
      expect(response.body.error.message).toContain('db down');
      expect(response.body.error.context.requestId).toBe('test-request-id');
    });

    it('returns 500 envelope when enqueue throws a non-Error value', async () => {
      // toErrorMessage's fallback path for non-Error throws.
      mockJobQueue.enqueue.mockRejectedValueOnce('plain string failure');

      const response = await request(app).post('/webhooks/jobs').send({});

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('API_ERROR');
      expect(typeof response.body.error.message).toBe('string');
    });

    it('returns 400 on malformed JSON body', async () => {
      // express.json()'s SyntaxError from body-parser surfaces as a 400 with
      // its own envelope, NOT through our zod validation path. This test
      // pins that behavior so future changes notice if it shifts.
      const response = await request(app)
        .post('/webhooks/jobs')
        .set('Content-Type', 'application/json')
        .send('{not json');

      expect(response.status).toBe(400);
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('POST /webhooks/wallet-fetch security and validation', () => {
    const ORIGINAL_SECRET = process.env['WEBHOOK_SECRET'];

    afterEach(() => {
      // Restore env so cross-suite leakage stays impossible.
      if (ORIGINAL_SECRET === undefined) {
        delete process.env['WEBHOOK_SECRET'];
      } else {
        process.env['WEBHOOK_SECRET'] = ORIGINAL_SECRET;
      }
    });

    it('rejects payload with invalid wallet address', async () => {
      const response = await request(app).post('/webhooks/wallet-fetch').send({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        walletAddress: 'not-a-wallet',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns 401 when WEBHOOK_SECRET is set and secret is missing', async () => {
      process.env['WEBHOOK_SECRET'] = 'expected';

      const response = await request(app).post('/webhooks/wallet-fetch').send({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        walletAddress: '0x1234567890123456789012345678901234567890',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('returns 401 when WEBHOOK_SECRET is set and secret mismatches', async () => {
      process.env['WEBHOOK_SECRET'] = 'expected';

      const response = await request(app).post('/webhooks/wallet-fetch').send({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        walletAddress: '0x1234567890123456789012345678901234567890',
        secret: 'wrong',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
    });

    it('accepts payload when WEBHOOK_SECRET is set and secret matches', async () => {
      process.env['WEBHOOK_SECRET'] = 'expected';

      const response = await request(app).post('/webhooks/wallet-fetch').send({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        walletAddress: '0x1234567890123456789012345678901234567890',
        secret: 'expected',
      });

      expect(response.status).toBe(202);
      expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /webhooks/jobs/:jobId edge cases', () => {
    it('returns 404 with API_ERROR envelope when job is unknown', async () => {
      mockJobQueue.getJob.mockReturnValueOnce(undefined);

      const response = await request(app).get('/webhooks/jobs/missing-id');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('API_ERROR');
      expect(response.body.error.message).toBe('Job not found');
    });

    it('returns 500 envelope when getJob throws', async () => {
      mockJobQueue.getJob.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('API_ERROR');
      expect(response.body.error.message).toBe('Failed to retrieve job status');
    });

    it('returns 202 while job is still processing', async () => {
      // determineJobStatusCode returns 202 for pending/processing regardless
      // of whether a result snapshot exists yet.
      mockJobQueue.getJob.mockReturnValueOnce(
        createMockJob({ status: 'processing' }),
      );
      mockJobQueue.getResult.mockReturnValueOnce(undefined);

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(202);
      expect(response.body.data.status).toBe('processing');
    });

    it('returns 206 when a completed job has source-level errors', async () => {
      // hasPartialSourceFailures branch of the 206 logic.
      mockJobQueue.getJob.mockReturnValueOnce(
        createMockJob({ status: 'completed' }),
      );
      mockJobQueue.getResult.mockReturnValueOnce({
        success: true,
        data: {
          jobId: 'job-123',
          status: 'completed',
          recordsProcessed: 5,
          recordsInserted: 5,
          sourceResults: {
            defillama: {
              success: false,
              recordsProcessed: 0,
              recordsInserted: 0,
              errors: ['rate-limited'],
              source: 'defillama',
            },
          },
          duration: 100,
          completedAt: new Date('2024-01-01T00:00:01Z'),
        },
      });

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(206);
    });

    it('returns 206 when recordsInserted < recordsProcessed', async () => {
      // Records-mismatch branch of the 206 logic — distinct from the
      // source-errors branch above.
      mockJobQueue.getJob.mockReturnValueOnce(
        createMockJob({ status: 'completed' }),
      );
      mockJobQueue.getResult.mockReturnValueOnce({
        success: true,
        data: {
          jobId: 'job-123',
          status: 'completed',
          recordsProcessed: 10,
          recordsInserted: 7,
          sourceResults: {},
          duration: 100,
          completedAt: new Date('2024-01-01T00:00:01Z'),
        },
      });

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(206);
    });

    it('returns 500 with failed-result error when job failed', async () => {
      mockJobQueue.getJob.mockReturnValueOnce(
        createMockJob({ status: 'failed' }),
      );
      mockJobQueue.getResult.mockReturnValueOnce({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'pipeline crashed',
          source: 'system',
          context: { jobId: 'job-123' },
        },
      });

      const response = await request(app).get('/webhooks/jobs/job-123');

      expect(response.status).toBe(500);
      expect(response.body.data.status).toBe('failed');
      expect(response.body.data.error?.message).toBe('pipeline crashed');
    });
  });
});
