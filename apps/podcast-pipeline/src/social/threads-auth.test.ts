import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertThreadsSessionReady,
  buildThreadsAuthorizationUrl,
  ensureThreadsSession,
  readThreadsSession,
  type ThreadsCallbackServerOptions,
  type ThreadsSession,
  waitForThreadsAuthorizationCode,
  writeThreadsSession,
} from './threads-auth.js';

const NOW = Date.UTC(2026, 7, 15, 0, 0, 0);
const DAY_MS = 24 * 60 * 60_000;
const TEST_ENV = {
  THREADS_APP_ID: 'app-123',
  THREADS_APP_SECRET: 'app-secret',
  THREADS_REDIRECT_URI: 'https://threads-local.test:8443/callback',
  THREADS_TLS_CERT_PATH: '/test/cert.pem',
  THREADS_TLS_KEY_PATH: '/test/key.pem',
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function createSessionPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'threads-auth-'));
  temporaryDirectories.push(directory);
  return join(directory, 'private', 'threads-session.json');
}

function session(overrides: Partial<ThreadsSession> = {}): ThreadsSession {
  return {
    version: 1,
    accessToken: 'saved-token',
    expiresAt: NOW + 30 * DAY_MS,
    userId: 'user-1',
    username: 'zap',
    ...overrides,
  };
}

function validDebugResponse(expiresAt = NOW + 60 * DAY_MS): Response {
  return jsonResponse({
    data: {
      is_valid: true,
      expires_at: Math.floor(expiresAt / 1_000),
      scopes: ['threads_basic', 'threads_content_publish'],
    },
  });
}

type CreateCallbackServer = NonNullable<
  ThreadsCallbackServerOptions['createServerImpl']
>;
type CallbackListener = Parameters<CreateCallbackServer>[1];

function createCallbackHarness(): {
  close: ReturnType<typeof vi.fn>;
  createServerImpl: CreateCallbackServer;
  dispatch: (
    url: string,
    method?: string,
  ) => {
    end: ReturnType<typeof vi.fn>;
    writeHead: ReturnType<typeof vi.fn>;
  };
  listen: ReturnType<typeof vi.fn>;
} {
  let listener: CallbackListener | undefined;
  const close = vi.fn();
  const server = {
    listening: true,
    close,
    listen: vi.fn((_port: number, _host: string, onListening: () => void) => {
      onListening();
      return server;
    }),
    once: vi.fn(() => server),
  };
  const createServerImpl: CreateCallbackServer = (_options, nextListener) => {
    listener = nextListener;
    return server;
  };

  return {
    close,
    createServerImpl,
    dispatch(url, method = 'GET') {
      if (!listener) throw new Error('Callback server is not listening.');
      const response = { end: vi.fn(), writeHead: vi.fn() };
      listener({ method, url }, response);
      return response;
    },
    listen: server.listen,
  };
}

function callbackOptions(
  harness: ReturnType<typeof createCallbackHarness>,
): ThreadsCallbackServerOptions {
  return {
    redirectUri: TEST_ENV.THREADS_REDIRECT_URI,
    expectedState: 'csrf-state',
    tlsCertPath: TEST_ENV.THREADS_TLS_CERT_PATH,
    tlsKeyPath: TEST_ENV.THREADS_TLS_KEY_PATH,
    timeoutMs: 300_000,
    onReady: vi.fn(async () => undefined),
    createServerImpl: harness.createServerImpl,
    readFileImpl: vi.fn(async () => Buffer.from('test-pem')),
  };
}

describe('Threads authorization URL', () => {
  it('uses the Threads authorize endpoint, exact scopes, and CSRF state', () => {
    const value = buildThreadsAuthorizationUrl({
      appId: 'app-123',
      redirectUri: TEST_ENV.THREADS_REDIRECT_URI,
      state: 'cryptographic-state',
    });
    const url = new URL(value);

    expect(url.origin + url.pathname).toBe(
      'https://www.threads.com/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('app-123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      TEST_ENV.THREADS_REDIRECT_URI,
    );
    expect(url.searchParams.get('scope')).toBe(
      'threads_basic,threads_content_publish',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('cryptographic-state');
  });
});

describe('Threads HTTPS callback', () => {
  it('binds to loopback and accepts only the configured callback path', async () => {
    const harness = createCallbackHarness();
    const options = callbackOptions(harness);
    const result = waitForThreadsAuthorizationCode(options);
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());

    const wrongPath = harness.dispatch('/not-the-callback?code=wrong');
    expect(wrongPath.writeHead).toHaveBeenCalledWith(404, expect.any(Object));

    const accepted = harness.dispatch(
      '/callback?code=authorization-code&state=csrf-state',
    );
    await expect(result).resolves.toBe('authorization-code');
    expect(harness.listen).toHaveBeenCalledWith(
      8443,
      '127.0.0.1',
      expect.any(Function),
    );
    expect(accepted.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Cache-Control': 'no-store' }),
    );
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('rejects a callback with a mismatched state', async () => {
    const harness = createCallbackHarness();
    const result = waitForThreadsAuthorizationCode(callbackOptions(harness));
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());

    harness.dispatch('/callback?code=authorization-code&state=attacker-state');

    await expect(result).rejects.toThrow(
      'Threads authorization callback state did not match.',
    );
  });

  it('preserves a provider rejection without accepting a code', async () => {
    const harness = createCallbackHarness();
    const result = waitForThreadsAuthorizationCode(callbackOptions(harness));
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());

    harness.dispatch(
      '/callback?error=access_denied&error_description=User%20declined&state=csrf-state',
    );

    await expect(result).rejects.toThrow(
      'Threads authorization was rejected: User declined',
    );
  });

  it('closes the callback server after the configured timeout', async () => {
    const harness = createCallbackHarness();
    let expire: (() => void) | undefined;
    const options = callbackOptions(harness);
    options.setTimeoutImpl = (listener) => {
      expire = listener;
      return {} as ReturnType<typeof setTimeout>;
    };
    const result = waitForThreadsAuthorizationCode(options);
    await vi.waitFor(() => expect(expire).toBeDefined());

    expire?.();

    await expect(result).rejects.toThrow(
      'Timed out waiting for Threads authorization after 300000ms.',
    );
    expect(harness.close).toHaveBeenCalledOnce();
  });
});

describe('Threads OAuth and secure session', () => {
  it('exchanges the code, validates the long-lived token, and persists it securely', async () => {
    const sessionPath = await createSessionPath();
    const openBrowser = vi.fn<(url: string) => Promise<void>>(
      async () => undefined,
    );
    const waitForAuthorizationCode = vi.fn(async (input) => {
      expect(input.expectedState).toBe('csrf-state');
      expect(input.timeoutMs).toBe(300_000);
      await input.onReady();
      return 'authorization-code';
    });
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = request as URL;
      switch (url.pathname) {
        case '/oauth/access_token':
          return jsonResponse({
            access_token: 'short-token',
            user_id: 'user-1',
          });
        case '/access_token':
          return jsonResponse({
            access_token: 'long-token',
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          });
        case '/debug_token':
          return validDebugResponse(NOW + 55 * DAY_MS);
        case '/me':
          return jsonResponse({ id: 'user-1', username: 'zap' });
        default:
          throw new Error(
            `Unexpected request: ${init?.method ?? 'GET'} ${url.pathname}`,
          );
      }
    });

    const result = await ensureThreadsSession({
      sessionPath,
      env: TEST_ENV,
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
      now: () => NOW,
      createState: () => 'csrf-state',
      openBrowser,
      waitForAuthorizationCode,
    });

    expect(result).toEqual({
      session: {
        version: 1,
        accessToken: 'long-token',
        expiresAt: NOW + 55 * DAY_MS,
        userId: 'user-1',
        username: 'zap',
      },
      profile: { id: 'user-1', username: 'zap' },
    });
    const authorizationUrl = new URL(openBrowser.mock.calls[0]?.[0] ?? '');
    expect(authorizationUrl.searchParams.get('state')).toBe('csrf-state');

    const codeExchangeUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    const codeExchangeInit = fetchImpl.mock.calls[0]?.[1];
    expect(codeExchangeUrl.pathname).toBe('/oauth/access_token');
    expect(codeExchangeInit?.method).toBe('POST');
    expect(codeExchangeInit?.body).toBeInstanceOf(URLSearchParams);
    const codeExchangeBody = codeExchangeInit?.body as URLSearchParams;
    expect(codeExchangeBody.get('client_secret')).toBe('app-secret');
    expect(codeExchangeBody.get('redirect_uri')).toBe(
      TEST_ENV.THREADS_REDIRECT_URI,
    );

    const longTokenUrl = fetchImpl.mock.calls[1]?.[0] as URL;
    expect(longTokenUrl.pathname).toBe('/access_token');
    expect(longTokenUrl.searchParams.get('grant_type')).toBe(
      'th_exchange_token',
    );
    expect(longTokenUrl.searchParams.get('access_token')).toBe('short-token');

    const debugUrl = fetchImpl.mock.calls[2]?.[0] as URL;
    expect(debugUrl.pathname).toBe('/debug_token');
    expect(debugUrl.searchParams.get('input_token')).toBe('long-token');
    expect(fetchImpl.mock.calls[2]?.[1]?.headers).toEqual({
      Authorization: 'Bearer long-token',
    });

    await expect(readThreadsSession({ sessionPath })).resolves.toEqual(
      result.session,
    );
    expect((await stat(sessionPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(join(sessionPath, '..'))).toEqual([
      'threads-session.json',
    ]);
  });

  it('refreshes an unexpired long-lived token within seven days', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session({ expiresAt: NOW + 6 * DAY_MS }), {
      sessionPath,
    });
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      switch (url.pathname) {
        case '/refresh_access_token':
          return jsonResponse({
            access_token: 'refreshed-token',
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          });
        case '/debug_token':
          return validDebugResponse(NOW + 60 * DAY_MS);
        case '/me':
          return jsonResponse({ id: 'user-1', username: 'zap' });
        default:
          throw new Error(`Unexpected request: ${url.pathname}`);
      }
    });

    const result = await assertThreadsSessionReady({
      sessionPath,
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
      now: () => NOW,
    });

    expect(result.session.accessToken).toBe('refreshed-token');
    const refreshUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(refreshUrl.pathname).toBe('/refresh_access_token');
    expect(refreshUrl.searchParams.get('grant_type')).toBe('th_refresh_token');
    expect(refreshUrl.searchParams.get('access_token')).toBe('saved-token');
    await expect(readThreadsSession({ sessionPath })).resolves.toEqual(
      result.session,
    );
  });

  it('keeps a token outside the refresh window and only validates it', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(validDebugResponse(NOW + 30 * DAY_MS))
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1', username: 'zap' }));

    await expect(
      assertThreadsSessionReady({
        sessionPath,
        fetchImpl,
        now: () => NOW,
      }),
    ).resolves.toEqual({
      session: session(),
      profile: { id: 'user-1', username: 'zap' },
    });
    const requestedPaths = fetchImpl.mock.calls.map(
      ([request]) => (request as URL).pathname,
    );
    expect(requestedPaths).toEqual(['/debug_token', '/me']);
  });

  it('does not open OAuth for a valid saved session', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async () => 'unused-code');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(validDebugResponse(NOW + 30 * DAY_MS))
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1', username: 'zap' }));

    await expect(
      ensureThreadsSession({
        sessionPath,
        fetchImpl,
        now: () => NOW,
        openBrowser,
        waitForAuthorizationCode,
      }),
    ).resolves.toEqual({
      session: session(),
      profile: { id: 'user-1', username: 'zap' },
    });
    expect(openBrowser).not.toHaveBeenCalled();
    expect(waitForAuthorizationCode).not.toHaveBeenCalled();
  });

  it('rejects an expired saved session before making an API request', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session({ expiresAt: NOW }), { sessionPath });
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      assertThreadsSessionReady({ sessionPath, fetchImpl, now: () => NOW }),
    ).rejects.toThrow(
      'The Threads session has expired. Run `pnpm social:login` to reconnect it.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reauthorizes a saved token that the debugger reports as revoked', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async (input) => {
      await input.onReady();
      return 'authorization-code';
    });
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      switch (url.pathname) {
        case '/debug_token':
          return url.searchParams.get('input_token') === 'saved-token'
            ? jsonResponse({
                data: {
                  is_valid: false,
                  expires_at: Math.floor((NOW + 30 * DAY_MS) / 1_000),
                  scopes: ['threads_basic', 'threads_content_publish'],
                },
              })
            : validDebugResponse(NOW + 55 * DAY_MS);
        case '/oauth/access_token':
          return jsonResponse({
            access_token: 'short-token',
            user_id: 'user-1',
          });
        case '/access_token':
          return jsonResponse({
            access_token: 'long-token',
            token_type: 'bearer',
            expires_in: 60 * 24 * 60 * 60,
          });
        case '/me':
          return jsonResponse({ id: 'user-1', username: 'zap' });
        default:
          throw new Error(`Unexpected request: ${url.pathname}`);
      }
    });

    const result = await ensureThreadsSession({
      sessionPath,
      env: TEST_ENV,
      fetchImpl,
      now: () => NOW,
      openBrowser,
      waitForAuthorizationCode,
    });

    expect(result.session.accessToken).toBe('long-token');
    expect(waitForAuthorizationCode).toHaveBeenCalledOnce();
    expect(openBrowser).toHaveBeenCalledOnce();
  });

  it('does not open OAuth for a malformed token debugger response', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async () => 'unused-code');

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ unexpected: true })),
        now: () => NOW,
        openBrowser,
        waitForAuthorizationCode,
      }),
    ).rejects.toThrow('Threads API returned an invalid token debug response.');
    expect(openBrowser).not.toHaveBeenCalled();
    expect(waitForAuthorizationCode).not.toHaveBeenCalled();
  });

  it('rejects a malformed authorization-code exchange response', async () => {
    const sessionPath = await createSessionPath();
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async (input) => {
      await input.onReady();
      return 'authorization-code';
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ unexpected: true }));

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        fetchImpl,
        now: () => NOW,
        openBrowser,
        waitForAuthorizationCode,
      }),
    ).rejects.toThrow(
      'Threads API returned an invalid authorization token response.',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects a malformed long-lived token exchange response', async () => {
    const sessionPath = await createSessionPath();
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async (input) => {
      await input.onReady();
      return 'authorization-code';
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: 'short-token', user_id: 'user-1' }),
      )
      .mockResolvedValueOnce(jsonResponse({ token_type: 'bearer' }));

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        fetchImpl,
        now: () => NOW,
        openBrowser,
        waitForAuthorizationCode,
      }),
    ).rejects.toThrow(
      'Threads API returned an invalid long-lived token exchange response.',
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not reauthorize when a refresh response is malformed', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session({ expiresAt: NOW + 6 * DAY_MS }), {
      sessionPath,
    });
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async () => 'unused-code');

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ token_type: 'bearer' })),
        now: () => NOW,
        openBrowser,
        waitForAuthorizationCode,
      }),
    ).rejects.toThrow(
      'Threads API returned an invalid long-lived token refresh response.',
    );
    expect(openBrowser).not.toHaveBeenCalled();
    expect(waitForAuthorizationCode).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'a malformed debug response',
      body: { unexpected: true },
      message: 'invalid token debug response',
    },
    {
      label: 'an invalid token',
      body: {
        data: {
          is_valid: false,
          expires_at: Math.floor((NOW + DAY_MS) / 1_000),
          scopes: ['threads_basic', 'threads_content_publish'],
        },
      },
      message: 'access token is invalid',
    },
    {
      label: 'an expired token',
      body: {
        data: {
          is_valid: true,
          expires_at: Math.floor((NOW - DAY_MS) / 1_000),
          scopes: ['threads_basic', 'threads_content_publish'],
        },
      },
      message: 'access token is expired',
    },
    {
      label: 'a missing publish scope',
      body: {
        data: {
          is_valid: true,
          expires_at: Math.floor((NOW + DAY_MS) / 1_000),
          scopes: ['threads_basic'],
        },
      },
      message: 'threads_content_publish',
    },
    {
      label: 'a malformed scope list',
      body: {
        data: {
          is_valid: true,
          expires_at: Math.floor((NOW + DAY_MS) / 1_000),
          scopes: 'threads_basic,threads_content_publish',
        },
      },
      message: 'invalid token scope response',
    },
  ])('rejects $label', async ({ body, message }) => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });

    await expect(
      assertThreadsSessionReady({
        sessionPath,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body)),
        now: () => NOW,
      }),
    ).rejects.toThrow(message);
  });

  it('rejects a malformed stored session instead of exposing its fields', async () => {
    const sessionPath = await createSessionPath();
    await mkdir(join(sessionPath, '..'), { recursive: true });
    await writeFile(
      sessionPath,
      JSON.stringify({ version: 1, accessToken: 'secret-only' }),
      { encoding: 'utf8', mode: 0o644 },
    );

    await expect(readThreadsSession({ sessionPath })).rejects.toThrow(
      'Invalid Threads session',
    );
  });
});
