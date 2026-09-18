import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ETLJob } from '../../../src/types/index.js';
import { logger } from '../../../src/utils/logger.js';
import { createEtlJob } from '../../utils/createEtlJob.js';

const mockJobQueue = {
  enqueue: vi.fn(),
  getJob: vi.fn(),
  getResult: vi.fn(),
};

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../src/modules/core/jobQueueSingleton.js', () => ({
  etlJobQueue: mockJobQueue,
}));

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

describe('Webhooks Router coverage', () => {
  let app: express.Application;
  const originalWebhookSecret = process.env['WEBHOOK_SECRET'];
  const webhookSecret = 'expected-webhook-secret';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockJobQueue.enqueue.mockResolvedValue(createEtlJob());
    mockJobQueue.getJob.mockReturnValue(undefined);
    mockJobQueue.getResult.mockReturnValue(undefined);
    app = await createTestApp();
  });

  afterEach(() => {
    if (originalWebhookSecret === undefined) {
      delete process.env['WEBHOOK_SECRET'];
    } else {
      process.env['WEBHOOK_SECRET'] = originalWebhookSecret;
    }
  });

  it('covers the missing-body fallback when parsing job payloads', async () => {
    process.env['WEBHOOK_SECRET'] = webhookSecret;

    // Mount the router with no body parser: a body-less POST then arrives
    // with req.body undefined (as production body-parser skips do), so the
    // `req.body ?? {}` fallback is exercised.
    const bareApp = express();
    const { webhooksRouter } = await import('../../../src/routes/webhooks.js');
    bareApp.use('/webhooks', webhooksRouter);

    const response = await request(bareApp)
      .post('/webhooks/jobs')
      .set('Authorization', `Bearer ${webhookSecret}`);

    expect(response.status).toBe(202);
    expect(mockJobQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with API_ERROR when wallet-fetch enqueue throws a non-Zod error', async () => {
    mockJobQueue.enqueue.mockRejectedValueOnce(new Error('queue exploded'));

    const response = await request(app).post('/webhooks/wallet-fetch').send({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      walletAddress: '0x1234567890123456789012345678901234567890',
    });

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('API_ERROR');
    expect(response.body.error.message).toContain('queue exploded');
  });

  it('warns but still responds when job status fails schema validation', async () => {
    const job: ETLJob = createEtlJob({ status: 'failed' });
    mockJobQueue.getJob.mockReturnValueOnce(job);
    // 'DATABASE_ERROR' is outside EtlErrorCodeEnum, so buildJobStatusResponse
    // produces a payload that validateJobStatusResponse must reject.
    mockJobQueue.getResult.mockReturnValueOnce({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'db gone',
        source: 'system',
        context: { jobId: 'job-123' },
      },
    });

    const response = await request(app).get('/webhooks/jobs/job-123');

    expect(response.status).toBe(500);
    expect(response.body.data.status).toBe('failed');
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      'Job status schema validation failed',
      expect.objectContaining({ jobId: 'job-123' }),
    );
  });
});
