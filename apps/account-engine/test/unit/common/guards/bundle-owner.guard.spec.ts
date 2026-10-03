import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { requireBundleOwner } from '../../../../src/common/guards/bundle-owner.guard';
import {
  getErrorStatus,
  toErrorResponse,
  UnauthorizedException,
} from '../../../../src/common/http';

function setup(recent = false) {
  const authenticate = vi.fn().mockResolvedValue({
    user_id: 'owner',
    created_at: new Date().toISOString(),
  });
  const trackUserId = vi.fn();
  const app = new Hono();
  app.get(
    '/:userId',
    requireBundleOwner({ authenticate } as never, { trackUserId } as never, {
      recent,
    }),
    (c) => c.json({ ok: true }),
  );
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return { app, authenticate, trackUserId };
}

describe('bundle owner guard', () => {
  it.each([undefined, 'Basic token', 'Bearer ', 'Bearer token extra'])(
    'requires a bearer session (%s)',
    async (authorization) => {
      const { app, authenticate } = setup();
      const response = await app.request('/owner', {
        headers: authorization ? { Authorization: authorization } : {},
      });
      expect(response.status).toBe(401);
      expect(authenticate).not.toHaveBeenCalled();
      expect((await response.json()).message).toContain('舊版 Zap Pilot');
    },
  );
  it('tracks only authenticated owner activity', async () => {
    const { app, authenticate, trackUserId } = setup();
    expect(
      (
        await app.request('/owner', {
          headers: { Authorization: 'Bearer token' },
        })
      ).status,
    ).toBe(200);
    expect(authenticate).toHaveBeenCalledWith('token');
    expect(trackUserId).toHaveBeenCalledWith('owner');
  });
  it('rejects tokens belonging to a different bundle', async () => {
    const { app, trackUserId } = setup();
    expect(
      (
        await app.request('/other', {
          headers: { Authorization: 'Bearer token' },
        })
      ).status,
    ).toBe(403);
    expect(trackUserId).not.toHaveBeenCalled();
  });
  it('rejects expired sessions', async () => {
    const { app, authenticate } = setup();
    authenticate.mockRejectedValue(new UnauthorizedException());
    expect(
      (
        await app.request('/owner', {
          headers: { Authorization: 'Bearer expired' },
        })
      ).status,
    ).toBe(401);
  });
  it('requires a fresh signature for sensitive changes', async () => {
    const { app, authenticate, trackUserId } = setup(true);
    authenticate.mockResolvedValue({
      user_id: 'owner',
      created_at: new Date(Date.now() - 600001).toISOString(),
    });
    const response = await app.request('/owner', {
      headers: { Authorization: 'Bearer old' },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'RECENT_SIGN_IN_REQUIRED',
    });
    expect(trackUserId).not.toHaveBeenCalled();
  });
});
