import { Hono } from 'hono';
import type { Mock } from 'vitest';

import {
  getErrorStatus,
  HttpException,
  HttpStatus,
  NotFoundException,
  toErrorResponse,
} from '../../../src/common/http';
import type { AppServices } from '../../../src/container';
import { createUsersRoutes } from '../../../src/routes/users';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const VALID_WALLET_ID = '223e4567-e89b-12d3-a456-426614174001';

function createServices(): AppServices {
  return {
    accountAuthService: {
      authenticate: vi.fn().mockResolvedValue({
        user_id: VALID_UUID,
        created_at: new Date().toISOString(),
      }),
      verifyBinding: vi.fn().mockResolvedValue({ success: true }),
    },
    activityTracker: {
      trackUserId: vi.fn(),
      cleanupCache: vi.fn(),
    },
    usersService: {
      getUserByWallet: vi
        .fn()
        .mockResolvedValue({ id: 'user-1', wallet: VALID_WALLET }),
      connectWallet: vi
        .fn()
        .mockResolvedValue({ user_id: 'user-1', is_new_user: false }),
      addWallet: vi.fn().mockResolvedValue({ wallet_id: 'w-1' }),
      requestWalletBindingChallenge: vi.fn().mockResolvedValue({
        nonce: 'a'.repeat(64),
        message: 'ZapPilot wallet ownership proof',
        expiresAt: '2026-01-01T00:05:00.000Z',
      }),
      verifyWalletOwnership: vi.fn().mockResolvedValue({
        success: true,
        message: 'Wallet ownership verified successfully',
        ownership_verified_at: '2026-08-22T00:00:00.000Z',
      }),
      requestDeletionChallenge: vi.fn().mockResolvedValue({
        nonce: 'b'.repeat(64),
        message: 'Zap Pilot Account Deletion',
        expiresAt: '2026-01-01T00:05:00.000Z',
      }),
      updateEmail: vi.fn().mockResolvedValue({ email: 'a@b.com' }),
      unsubscribeFromReports: vi.fn().mockResolvedValue({ success: true }),
      unsubscribeFromReportsWithToken: vi
        .fn()
        .mockResolvedValue({ success: true }),
      updateWalletLabel: vi.fn().mockResolvedValue({ label: 'My Wallet' }),
      getUserWallets: vi.fn().mockResolvedValue([]),
      removeWallet: vi.fn().mockResolvedValue({ success: true }),
      triggerWalletDataFetch: vi
        .fn()
        .mockResolvedValue({ job_id: 'j-1', rate_limited: false }),
      getUserProfile: vi.fn().mockResolvedValue({ id: VALID_UUID }),
      deleteUser: vi.fn().mockResolvedValue({ success: true }),
      requestTelegramToken: vi.fn().mockResolvedValue({ token: 'tok-1' }),
      getTelegramStatus: vi.fn().mockResolvedValue({ connected: false }),
      disconnectTelegram: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as AppServices;
}

function createApp(services: AppServices) {
  const app = new Hono();
  app.route('/users', createUsersRoutes(services));
  app.onError((error, c) =>
    c.json(toErrorResponse(c.req.path, error), getErrorStatus(error) as never),
  );
  return {
    rawRequest: app.request.bind(app),
    request: (url: string, init?: RequestInit) =>
      app.request(url, {
        ...init,
        headers: { Authorization: 'Bearer owner-token', ...init?.headers },
      }),
  };
}

describe('POST /users/connect-wallet', () => {
  it('returns 200 for a valid wallet', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/users/connect-wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: VALID_WALLET }),
      },
    );
    expect(response.status).toBe(200);
  });

  it('returns 400 for an invalid wallet address', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/users/connect-wallet',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: 'invalid' }),
      },
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /users/reports/unsubscribe', () => {
  it('forwards a signed token to the user service', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      'http://localhost/users/reports/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'signed-token' }),
      },
    );

    expect(response.status).toBe(200);
    expect(
      services.usersService.unsubscribeFromReportsWithToken,
    ).toHaveBeenCalledWith('signed-token');
  });

  it('rejects an empty token', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/users/reports/unsubscribe',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: '' }),
      },
    );

    expect(response.status).toBe(400);
  });
});

describe('POST /users/:userId/wallets', () => {
  it('forwards the ownership signature to the service', async () => {
    const services = createServices();
    const signature = `0x${'ab'.repeat(65)}`;
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}/wallets`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: VALID_WALLET,
          signature,
          challengeId: VALID_WALLET_ID,
        }),
      },
    );
    expect(response.status).toBe(201);
    expect((services.usersService.addWallet as Mock).mock.calls[0]).toEqual([
      VALID_UUID,
      VALID_WALLET,
      undefined,
    ]);
  });

  it('forwards undefined when the ownership signature is omitted', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}/wallets`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: VALID_WALLET }),
      },
    );
    expect(response.status).toBe(201);
    expect((services.usersService.addWallet as Mock).mock.calls[0]).toEqual([
      VALID_UUID,
      VALID_WALLET,
      undefined,
    ]);
  });

  it('returns 400 for an invalid userId', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/users/not-a-uuid/wallets',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: VALID_WALLET }),
      },
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for an invalid wallet in body', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: 'bad' }),
      },
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /users/:userId/wallets/:walletAddress/verify', () => {
  it('forwards the wallet and signature to the service', async () => {
    const services = createServices();
    const signature = `0x${'ab'.repeat(65)}`;
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/verify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature, challengeId: VALID_WALLET_ID }),
      },
    );

    expect(response.status).toBe(200);
    expect(services.accountAuthService.verifyBinding).toHaveBeenCalledWith(
      VALID_UUID,
      VALID_WALLET,
      VALID_WALLET_ID,
      signature,
    );
  });

  it('rejects a malformed signature', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/verify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: VALID_WALLET_ID,
          signature: '0x1234',
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  it('rejects an invalid wallet parameter', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/not-a-wallet/verify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: VALID_WALLET_ID,
          signature: `0x${'ab'.repeat(65)}`,
        }),
      },
    );

    expect(response.status).toBe(400);
  });
});

describe('PUT /users/:userId/email', () => {
  it('returns 200 for a valid email', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/email`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      },
    );
    expect(response.status).toBe(200);
  });

  it('returns 400 for an invalid email', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/email`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      },
    );
    expect(response.status).toBe(400);
  });
});

describe('DELETE /users/:userId/email', () => {
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/email`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
  });
});

describe('PUT /users/:userId/wallets/:walletAddress/label', () => {
  it('returns 200 for valid params and body', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/label`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'My Wallet' }),
      },
    );
    expect(response.status).toBe(200);
  });

  it('returns 400 for an invalid wallet address param', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/bad-wallet/label`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'My Wallet' }),
      },
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for an empty label body', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/label`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: '' }),
      },
    );
    expect(response.status).toBe(400);
  });
});

describe('GET /users/:userId/wallets', () => {
  it('returns 200 with wallets array', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets`,
    );
    expect(response.status).toBe(200);
  });
});

describe('DELETE /users/:userId/wallets/:walletId', () => {
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET_ID}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
  });
});

describe('POST /users/:userId/wallets/:walletAddress/fetch-data', () => {
  it('returns 202 when not rate limited', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/fetch-data`,
      { method: 'POST' },
    );
    expect(response.status).toBe(202);
  });

  it('returns 429 when rate_limited is true', async () => {
    const services = createServices();
    (services.usersService.triggerWalletDataFetch as Mock).mockResolvedValue({
      job_id: null,
      rate_limited: true,
      message: 'Too many requests',
    });
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}/wallets/${VALID_WALLET}/fetch-data`,
      { method: 'POST' },
    );
    expect(response.status).toBe(429);
  });
});

describe('GET /users/:userId', () => {
  it('returns 200 with user profile', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}`,
    );
    expect(response.status).toBe(200);
  });
});

describe('DELETE /users/:userId', () => {
  it('forwards a deletion ownership proof', async () => {
    const services = createServices();
    const signature = `0x${'ab'.repeat(65)}`;
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wallet: VALID_WALLET,
          signature,
          challengeId: VALID_WALLET_ID,
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(services.usersService.deleteUser).toHaveBeenCalledWith(
      VALID_UUID,
      VALID_WALLET_ID,
      signature,
    );
  });

  it('rejects deletion without a signed body', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /users/:userId/telegram/request-token', () => {
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/telegram/request-token`,
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
  });
});

describe('GET /users/:userId/telegram/status', () => {
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/telegram/status`,
    );
    expect(response.status).toBe(200);
  });
});

describe('DELETE /users/:userId/telegram/disconnect', () => {
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/telegram/disconnect`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
  });
});

describe('onError handler', () => {
  it('returns 500 for a generic Error thrown from a handler', async () => {
    const services = createServices();
    (services.usersService.getUserProfile as Mock).mockRejectedValue(
      new Error('unexpected failure'),
    );
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}`,
    );
    expect(response.status).toBe(500);
  });

  it('uses the HttpException statusCode when an HttpException is thrown', async () => {
    const services = createServices();
    (services.usersService.getUserProfile as Mock).mockRejectedValue(
      new NotFoundException('User not found'),
    );
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}`,
    );
    expect(response.status).toBe(404);
  });

  it('uses the HttpException statusCode for other subclasses', async () => {
    const services = createServices();
    (services.usersService.getUserProfile as Mock).mockRejectedValue(
      new HttpException('Rate limited', HttpStatus.TOO_MANY_REQUESTS),
    );
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}`,
    );
    expect(response.status).toBe(429);
  });

  it('uses the statusCode from a non-AppError object when thrown', async () => {
    const services = createServices();
    const err = Object.assign(new Error('Service unavailable'), {
      statusCode: 503,
    });
    (services.usersService.getUserProfile as Mock).mockRejectedValue(err);
    const response = await createApp(services).request(
      `http://localhost/users/${VALID_UUID}`,
    );
    expect(response.status).toBe(503);
  });
});

describe('GET /users/by-wallet/:walletAddress', () => {
  // Locks: routes/users.ts /by-wallet/:walletAddress handler (function + lines).
  // mutation: not run (offline sandbox — vitest could not be executed here).

  it('returns the user for a valid wallet address', async () => {
    const services = createServices();
    const response = await createApp(services).request(
      `http://localhost/users/by-wallet/${VALID_WALLET}`,
    );

    expect(response.status).toBe(200);
    expect(
      (services.usersService.getUserByWallet as Mock).mock.calls[0],
    ).toEqual([VALID_WALLET, { verifiedOnly: false }]);
  });

  it('returns 400 for an invalid wallet address', async () => {
    const response = await createApp(createServices()).request(
      'http://localhost/users/by-wallet/not-a-wallet',
    );

    expect(response.status).toBe(400);
  });
});

describe('owner route enforcement', () => {
  it.each([
    ['POST', '/wallets'],
    ['PUT', '/email'],
    ['DELETE', '/email'],
    ['PUT', `/wallets/${VALID_WALLET}/label`],
    ['POST', `/wallets/${VALID_WALLET}/verify`],
    ['DELETE', `/wallets/${VALID_WALLET_ID}`],
    ['POST', `/wallets/${VALID_WALLET}/fetch-data`],
    ['POST', '/telegram/request-token'],
    ['GET', '/telegram/status'],
    ['DELETE', '/telegram/disconnect'],
  ])('requires a bearer for %s %s', async (method, path) => {
    const services = createServices();
    const response = await createApp(services).rawRequest(
      `/users/${VALID_UUID}${path}`,
      { method },
    );
    expect(response.status).toBe(401);
    expect(services.activityTracker.trackUserId).not.toHaveBeenCalled();
  });
  it('rejects another bundle token', async () => {
    const services = createServices();
    (services.accountAuthService.authenticate as Mock).mockResolvedValue({
      user_id: VALID_WALLET_ID,
      created_at: new Date().toISOString(),
    });
    expect(
      (
        await createApp(services).request(`/users/${VALID_UUID}/email`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(403);
  });
  it('allows public profile and wallet reads without tracking owner activity', async () => {
    const services = createServices();
    const app = createApp(services);
    expect((await app.rawRequest(`/users/${VALID_UUID}`)).status).toBe(200);
    expect((await app.rawRequest(`/users/${VALID_UUID}/wallets`)).status).toBe(
      200,
    );
    expect(services.activityTracker.trackUserId).not.toHaveBeenCalled();
  });
});
