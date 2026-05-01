import { describe, it, expect, beforeEach, vi } from 'vitest';
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

      await request(app).post('/webhooks/jobs').send({ tasks: [task] }).expect(202);

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
});
