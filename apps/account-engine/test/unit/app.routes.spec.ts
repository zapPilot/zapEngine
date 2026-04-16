import { NotFoundException } from '@common/http';
import type { AppServices } from '@container';
import {
  type Job,
  JobStatus,
  JobType,
} from '@modules/jobs/interfaces/job.interface';

import { createApp } from '../../src/app';

function createJob(overrides: Partial<Job> = {}): Job {
  const now = new Date('2026-01-01T00:00:00.000Z');

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

function createServices(): AppServices {
  const job = createJob();

  return {
    env: {
      SUPABASE_URL: 'http://localhost',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      PORT: 3004,
      NODE_ENV: 'test',
      ADMIN_API_KEY: 'secret',
      server: { port: 3004 },
      database: {
        supabase: {
          url: 'http://localhost',
          anonKey: 'anon',
          serviceRoleKey: 'service',
        },
      },
    },
    activityTracker: {
      trackRequest: jest.fn(),
      cleanupCache: jest.fn(),
    },
    usersService: {
      connectWallet: jest
        .fn()
        .mockResolvedValue({ user_id: 'user-1', is_new_user: false }),
      addWallet: jest.fn().mockResolvedValue({
        wallet_id: 'wallet-1',
        message: 'Wallet added successfully to user bundle',
      }),
      updateEmail: jest.fn(),
      unsubscribeFromReports: jest.fn(),
      updateWalletLabel: jest.fn(),
      getUserWallets: jest.fn(),
      removeWallet: jest.fn(),
      triggerWalletDataFetch: jest.fn().mockResolvedValue({
        job_id: null,
        status: 'error',
        message: 'Too many requests',
        rate_limited: true,
      }),
      getUserProfile: jest.fn(),
      deleteUser: jest.fn(),
      requestTelegramToken: jest.fn(),
      getTelegramStatus: jest.fn(),
      disconnectTelegram: jest.fn(),
      getEtlJobStatus: jest
        .fn()
        .mockResolvedValue({ job_id: 'etl-1', status: 'completed' }),
    },
    jobQueueService: {
      createJob: jest.fn().mockReturnValue(job),
      getJobWithAggregatedStatus: jest.fn().mockReturnValue({ job }),
    },
    telegramService: {
      validateWebhookSecret: jest.fn().mockReturnValue(true),
      getBot: jest.fn().mockReturnValue({
        handleUpdate: jest.fn().mockRejectedValue(new Error('boom')),
      }),
      logWebhookError: jest.fn(),
    },
  } as unknown as AppServices;
}

describe('Hono app routes', () => {
  it('serves health status', async () => {
    const app = createApp(createServices());

    const response = await app.request('http://localhost/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      service: 'account-engine',
    });
  });

  it('handles connect-wallet with validated JSON body', async () => {
    const services = createServices();
    const app = createApp(services);

    const response = await app.request(
      'http://localhost/users/connect-wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: '0x1234567890abcdef1234567890abcdef12345678',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(services.usersService.connectWallet).toHaveBeenCalledWith(
      '0x1234567890abcdef1234567890abcdef12345678',
    );
    expect(services.activityTracker.trackRequest).toHaveBeenCalled();
  });

  it('returns 429 when wallet fetch is rate limited', async () => {
    const services = createServices();
    const app = createApp(services);

    const response = await app.request(
      'http://localhost/users/123e4567-e89b-12d3-a456-426614174000/wallets/0x1234567890abcdef1234567890abcdef12345678/fetch-data',
      { method: 'POST' },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Too many requests',
      statusCode: 429,
    });
  });

  it('protects job creation endpoints with x-api-key', async () => {
    const services = createServices();
    const app = createApp(services);

    const unauthorized = await app.request(
      'http://localhost/jobs/weekly-report/batch',
      { method: 'POST' },
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await app.request(
      'http://localhost/jobs/weekly-report/batch',
      {
        method: 'POST',
        headers: { 'x-api-key': 'secret' },
      },
    );

    expect(authorized.status).toBe(202);
    expect(services.jobQueueService.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: JobType.WEEKLY_REPORT_BATCH }),
    );
  });

  it('keeps job status lookup public', async () => {
    const services = createServices();
    const app = createApp(services);

    const response = await app.request('http://localhost/jobs/job-1');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'job-1',
      status: JobStatus.PENDING,
    });
  });

  it('rejects Telegram webhooks with an invalid secret', async () => {
    const services = createServices();
    (
      services.telegramService.validateWebhookSecret as jest.Mock
    ).mockReturnValue(false);
    const app = createApp(services);

    const response = await app.request('http://localhost/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong',
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 200 for Telegram webhook processing errors after logging them', async () => {
    const services = createServices();
    const app = createApp(services);

    const response = await app.request('http://localhost/telegram/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body: JSON.stringify({ update_id: 1 }),
    });

    expect(response.status).toBe(200);
    expect(services.telegramService.logWebhookError).toHaveBeenCalled();
  });

  it('returns 404 JSON envelope for unknown routes', async () => {
    const app = createApp(createServices());

    const response = await app.request('http://localhost/unknown-route-xyz');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 404,
      message: 'Route not found',
    });
  });

  it('global onError returns 500 for a generic Error thrown from a route handler', async () => {
    const services = createServices();
    (services.usersService.getUserProfile as jest.Mock).mockRejectedValue(
      new Error('unexpected crash'),
    );
    const app = createApp(services);

    const response = await app.request(
      'http://localhost/users/123e4567-e89b-12d3-a456-426614174000',
    );

    expect(response.status).toBe(500);
  });

  it('global onError uses HttpException statusCode when available', async () => {
    const services = createServices();
    (services.usersService.getUserProfile as jest.Mock).mockRejectedValue(
      new NotFoundException('gone'),
    );
    const app = createApp(services);

    const response = await app.request(
      'http://localhost/users/123e4567-e89b-12d3-a456-426614174000',
    );

    expect(response.status).toBe(404);
  });
});
