import {
  getErrorStatus,
  HttpException,
  HttpStatus,
  NotFoundException,
  toErrorResponse,
} from '@common/http';
import type { AppServices } from '@container';
import { createUsersRoutes } from '@routes/users';
import { Hono } from 'hono';
import type { Mock } from 'vitest';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';
const VALID_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const VALID_WALLET_ID = '223e4567-e89b-12d3-a456-426614174001';

function createServices(): AppServices {
  return {
    activityTracker: {
      trackUserId: vi.fn(),
      cleanupCache: vi.fn(),
    },
    usersService: {
      connectWallet: vi
        .fn()
        .mockResolvedValue({ user_id: 'user-1', is_new_user: false }),
      addWallet: vi.fn().mockResolvedValue({ wallet_id: 'w-1' }),
      updateEmail: vi.fn().mockResolvedValue({ email: 'a@b.com' }),
      unsubscribeFromReports: vi.fn().mockResolvedValue({ success: true }),
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
  return app;
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

describe('POST /users/:userId/wallets', () => {
  it('returns 201 for a valid userId + wallet', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}/wallets`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wallet: VALID_WALLET }),
      },
    );
    expect(response.status).toBe(201);
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
  it('returns 200', async () => {
    const response = await createApp(createServices()).request(
      `http://localhost/users/${VALID_UUID}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
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
