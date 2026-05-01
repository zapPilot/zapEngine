import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockJobQueue = {
  enqueue: vi.fn(),
};

vi.mock('../../../src/modules/core/jobQueueSingleton.js', () => ({
  etlJobQueue: mockJobQueue,
}));

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});
async function createTestApp(): Promise<express.Application> {
  const app = express();
  app.use(express.json());
  const { backfillRouter } = await import('../../../src/routes/backfill.js');
  app.use('/backfill', backfillRouter);
  return app;
}

describe('Backfill compatibility route', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockJobQueue.enqueue.mockResolvedValue({ jobId: 'job-123' });
    app = await createTestApp();
  });

  it('queues token-price backfill work instead of executing inline', async () => {
    const payload = {
      trigger: 'manual',
      tokens: [
        { tokenId: 'bitcoin', tokenSymbol: 'BTC', daysBack: 3 },
        { tokenId: 'ethereum', tokenSymbol: 'ETH', daysBack: 3 },
      ],
    };

    const response = await request(app)
      .post('/backfill')
      .send(payload)
      .expect(202);

    expect(response.body.data.jobId).toBe('job-123');
    expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
      sources: ['token-price'],
      tasks: [
        {
          source: 'token-price',
          operation: 'backfill',
          tokens: payload.tokens,
        },
      ],
    });
  });

  it('queues macro Fear & Greed backfill work', async () => {
    await request(app)
      .post('/backfill/macro-fear-greed')
      .send({ trigger: 'manual', startDate: '2021-01-01' })
      .expect(202);

    expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
      sources: ['macro-fear-greed'],
      tasks: [
        {
          source: 'macro-fear-greed',
          operation: 'backfill',
          startDate: '2021-01-01',
        },
      ],
    });
  });

  it('validates token backfill payloads', async () => {
    const response = await request(app)
      .post('/backfill')
      .send({ tokens: [] })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockJobQueue.enqueue).not.toHaveBeenCalled();
  });
});
