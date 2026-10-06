import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { describe, expect, it, vi } from 'vitest';

import { getErrorStatus } from '../../../src/common/http';
import type { AppServices } from '../../../src/container';
import { createAuthRoutes } from '../../../src/routes/auth';

const userId = '123e4567-e89b-42d3-a456-426614174000';
const signature = `0x${'ab'.repeat(65)}`;
function fixture() {
  const auth = {
    authenticate: vi.fn().mockResolvedValue({
      user_id: userId,
      created_at: new Date().toISOString(),
    }),
    challenge: vi.fn().mockResolvedValue({ message: 'stored SIWE' }),
    session: vi.fn().mockResolvedValue({ token: 'session' }),
    reclaim: vi.fn().mockResolvedValue({ token: 'reclaimed' }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const trackUserId = vi.fn();
  const app = createAuthRoutes({
    accountAuthService: auth,
    activityTracker: { trackUserId },
  } as unknown as AppServices);
  app.onError((error, c) =>
    c.json(
      { message: error.message },
      getErrorStatus(error) as ContentfulStatusCode,
    ),
  );
  const request = (path: string, body?: object, token?: string) =>
    app.request(path, {
      method: body ? 'POST' : 'DELETE',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const challenge = {
    purpose: 'session',
    userId,
    wallet: '0x1234567890abcdef1234567890abcdef12345678',
    domain: 'zappilot.com',
  };
  return { app, auth, trackUserId, request, challenge };
}
describe('owner authentication routes', () => {
  it('issues public challenges and forwards stored proof IDs for sessions and reclaim', async () => {
    const f = fixture();
    expect((await f.request('/challenge', f.challenge)).status).toBe(200);
    expect(f.auth.challenge).toHaveBeenCalledWith(f.challenge);
    for (const path of ['session', 'reclaim'] as const) {
      expect(
        (await f.request(`/${path}`, { challengeId: userId, signature }))
          .status,
      ).toBe(200);
      expect(f.auth[path]).toHaveBeenCalledWith(userId, signature);
    }
    expect(f.trackUserId).not.toHaveBeenCalled();
    expect(
      (await f.request('/session', { challengeId: 'bad', signature })).status,
    ).toBe(400);
  });
  it('requires a recent session belonging to the bundle before issuing binding proof', async () => {
    const f = fixture();
    const input = { ...f.challenge, purpose: 'binding' };
    expect((await f.request('/challenge', input)).status).toBe(401);
    f.auth.authenticate.mockResolvedValueOnce({
      user_id: 'other',
      created_at: new Date().toISOString(),
    });
    expect((await f.request('/challenge', input, 'Bearer token')).status).toBe(
      403,
    );
    for (const created_at of [
      'invalid',
      new Date(Date.now() - 600001).toISOString(),
    ]) {
      f.auth.authenticate.mockResolvedValueOnce({
        user_id: userId,
        created_at,
      });
      expect(
        (await f.request('/challenge', input, 'Bearer token')).status,
      ).toBe(401);
    }
    expect((await f.request('/challenge', input, 'Bearer token')).status).toBe(
      200,
    );
    expect(f.trackUserId).toHaveBeenCalledWith(userId);
    expect(f.auth.challenge).toHaveBeenCalledTimes(1);
  });
  it('revokes only a supplied bearer and bounds challenge requests', async () => {
    const f = fixture();
    expect((await f.request('/session')).status).toBe(401);
    expect(
      (await f.request('/session', undefined, 'Bearer token')).status,
    ).toBe(200);
    expect(f.auth.revoke).toHaveBeenCalledWith('token');
    for (let i = 0; i < 8; i++)
      expect((await f.request('/challenge', f.challenge)).status).toBe(200);
    expect((await f.request('/challenge', f.challenge)).status).toBe(429);
  });
});
