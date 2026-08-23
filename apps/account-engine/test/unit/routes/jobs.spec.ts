import { Hono } from 'hono';
import type { Mock } from 'vitest';

import { getErrorStatus, toErrorResponse } from '../../../src/common/http';
import type { AppServices } from '../../../src/container';
import {
  Job,
  JobStatus,
  JobType,
} from '../../../src/modules/jobs/interfaces/job.interface';
import { createJobsRoutes } from '../../../src/routes/jobs';

const ADMIN_KEY = 'admin-secret';
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const now = new Date('2026-01-01T00:00:00.000Z');

function createJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
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

function createServices(jobOverrides: Partial<Job> = {}): AppServices {
  const job = createJob(jobOverrides);
  return {
    env: { ADMIN_API_KEY: ADMIN_KEY },
    telegramTokenService: {
      cleanupExpiredTokens: vi.fn().mockResolvedValue(3),
    },
    jobQueueService: {
      createJob: vi.fn().mockReturnValue(job),
      getJobWithAggregatedStatus: vi.fn().mockReturnValue({ job }),
    },
  } as unknown as AppServices;
}

function createApp(services: AppServices) {
  const app = new Hono();
  app.route('/jobs', createJobsRoutes(services));
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return app;
}

describe('POST /jobs/weekly-report/batch', () => {
  it('returns 401 without x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/batch',
      { method: 'POST' },
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 with the wrong x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/batch',
      { method: 'POST', headers: { 'x-api-key': 'wrong' } },
    );
    expect(response.status).toBe(401);
  });

  it('returns 202 with job when authorized', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      'http://localhost/jobs/weekly-report/batch',
      { method: 'POST', headers: { 'x-api-key': ADMIN_KEY } },
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.job.id).toBe('job-1');
    expect(body.job.scheduledAt).toBe(now.toISOString());
  });
});

describe('POST /jobs/weekly-report/single-user', () => {
  it('returns 401 without x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/single-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID }),
      },
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when testMode is true but testRecipient is missing', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/single-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ADMIN_KEY },
        body: JSON.stringify({ userId: USER_ID, testMode: true }),
      },
    );
    expect(response.status).toBe(400);
  });

  it('returns 202 for a valid request without testMode', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/single-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ADMIN_KEY },
        body: JSON.stringify({ userId: USER_ID }),
      },
    );
    expect(response.status).toBe(202);
  });

  it('returns 202 when testMode is true and testRecipient is provided', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/single-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ADMIN_KEY },
        body: JSON.stringify({
          userId: USER_ID,
          testMode: true,
          testRecipient: 'test@example.com',
        }),
      },
    );
    expect(response.status).toBe(202);
  });

  it('returns 400 for an invalid userId', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/weekly-report/single-user',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ADMIN_KEY },
        body: JSON.stringify({ userId: 'not-a-uuid' }),
      },
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /jobs/strategy-change/batch', () => {
  it('returns 401 without x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/strategy-change/batch',
      { method: 'POST' },
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 with a wrong x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/strategy-change/batch',
      { method: 'POST', headers: { 'x-api-key': 'wrong-key' } },
    );
    expect(response.status).toBe(401);
  });

  it('returns 202 and queues an unscoped job with no body', async () => {
    const services = createServices({ type: JobType.STRATEGY_CHANGE_BATCH });
    const response = await createApp(services).request(
      'http://localhost/jobs/strategy-change/batch',
      { method: 'POST', headers: { 'x-api-key': ADMIN_KEY } },
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.message).toBe(
      'Strategy change check job created successfully.',
    );
    expect(body.job.type).toBe('strategy_change_batch');
    expect(services.jobQueueService.createJob).toHaveBeenCalledWith({
      type: JobType.STRATEGY_CHANGE_BATCH,
      payload: {},
    });
  });
});

describe('POST /jobs/maintenance/telegram-token-cleanup', () => {
  it('returns 401 without x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/maintenance/telegram-token-cleanup',
      { method: 'POST' },
    );
    expect(response.status).toBe(401);
  });

  it('returns 401 with a wrong x-api-key', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/maintenance/telegram-token-cleanup',
      { method: 'POST', headers: { 'x-api-key': 'wrong-key' } },
    );
    expect(response.status).toBe(401);
  });

  it('runs cleanup and returns the deleted count when authorized', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      'http://localhost/jobs/maintenance/telegram-token-cleanup',
      { method: 'POST', headers: { 'x-api-key': ADMIN_KEY } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deletedCount: 3,
      message: 'Cleaned up 3 expired Telegram token(s).',
    });
    expect(
      services.telegramTokenService.cleanupExpiredTokens,
    ).toHaveBeenCalledOnce();
  });
});

describe('POST /jobs/daily-suggestion/batch', () => {
  it.each([undefined, {}, { userIds: [] }, { userIds: ['not-a-uuid'] }])(
    'returns 400 for an invalid operator list',
    async (body) => {
      const response = await createApp(createServices()).request(
        'http://localhost/jobs/daily-suggestion/batch',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': ADMIN_KEY,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      expect(response.status).toBe(400);
    },
  );

  it('requires the admin key and queues explicit userIds', async () => {
    const services = createServices({ type: JobType.DAILY_SUGGESTION_BATCH });
    const request = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ADMIN_KEY,
      },
      body: JSON.stringify({ userIds: [USER_ID] }),
    };
    const response = await createApp(services).request(
      'http://localhost/jobs/daily-suggestion/batch',
      request,
    );
    expect(response.status).toBe(202);
    expect(services.jobQueueService.createJob).toHaveBeenCalledWith({
      type: JobType.DAILY_SUGGESTION_BATCH,
      payload: { userIds: [USER_ID] },
    });
    expect((await response.json()).message).toContain('1 user(s)');
  });
});

describe('GET /jobs/:jobId', () => {
  it('returns 200 with job response', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/job-1',
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe('job-1');
    expect(body.scheduledAt).toBe(now.toISOString());
  });

  it('returns 404 when job is not found', async () => {
    const services = createServices();
    (
      services.jobQueueService.getJobWithAggregatedStatus as Mock
    ).mockReturnValue(null);
    const response = await createApp(services).request(
      'http://localhost/jobs/missing-job',
    );
    expect(response.status).toBe(404);
  });

  it('includes optional date fields as undefined when not set', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/jobs/job-1',
    );
    const body = await response.json();
    expect(body.startedAt).toBeUndefined();
    expect(body.completedAt).toBeUndefined();
  });

  it('includes optional date fields as ISO strings when set', async () => {
    const startedAt = new Date('2026-01-01T01:00:00.000Z');
    const completedAt = new Date('2026-01-01T02:00:00.000Z');
    const services = createServices({ startedAt, completedAt });
    const response = await createApp(services).request(
      'http://localhost/jobs/job-1',
    );
    const body = await response.json();
    expect(body.startedAt).toBe(startedAt.toISOString());
    expect(body.completedAt).toBe(completedAt.toISOString());
  });

  it('includes progress when returned by the service', async () => {
    const services = createServices();
    const progress = { total: 10, completed: 8, failed: 1, pending: 1 };
    (
      services.jobQueueService.getJobWithAggregatedStatus as Mock
    ).mockReturnValue({
      job: createJob(),
      progress,
    });
    const response = await createApp(services).request(
      'http://localhost/jobs/job-1',
    );
    const body = await response.json();
    expect(body.progress).toEqual(progress);
  });
});
