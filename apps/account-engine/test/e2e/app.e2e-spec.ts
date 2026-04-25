import type { AppServices } from '@/container';

import { createApp } from '../../src/app';

describe('App e2e', () => {
  it('serves /health through the Hono app', async () => {
    const app = createApp({
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
      activityTracker: { trackUserId: vi.fn(), cleanupCache: vi.fn() },
      usersService: {},
      jobQueueService: {
        getJobWithAggregatedStatus: vi.fn(),
      },
      telegramService: {
        validateWebhookSecret: vi.fn(),
        getBot: vi.fn(),
        logWebhookError: vi.fn(),
      },
    } as unknown as AppServices);

    const response = await app.request('http://localhost/health');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      service: 'account-engine',
    });
    expect(body).toHaveProperty('commitSha');
    expect(body).toHaveProperty('buildTime');
  });
});
