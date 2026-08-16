import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: processMocks.spawn,
}));

import {
  assertThreadsSessionReady,
  buildThreadsAuthorizationUrl,
  ensureThreadsSession,
  getThreadsProfile,
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  processMocks.spawn.mockReset();
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

function createCallbackHarness(listening = true): {
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
    listening,
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
  it('uses the default HTTPS port and ignores duplicate callbacks after settling', async () => {
    const harness = createCallbackHarness(false);
    const options = callbackOptions(harness);
    options.redirectUri = 'https://threads-local.test/callback';
    const result = waitForThreadsAuthorizationCode(options);
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());

    harness.dispatch('/callback?code=first&state=csrf-state');
    await expect(result).resolves.toBe('first');
    harness.dispatch('/callback?code=second&state=csrf-state');

    expect(harness.listen).toHaveBeenCalledWith(
      443,
      '127.0.0.1',
      expect.any(Function),
    );
    expect(harness.close).not.toHaveBeenCalled();
  });

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

  it('rejects non-GET requests, missing codes, and provider fallback errors', async () => {
    const methodHarness = createCallbackHarness();
    const methodResult = waitForThreadsAuthorizationCode(
      callbackOptions(methodHarness),
    );
    await vi.waitFor(() => expect(methodHarness.listen).toHaveBeenCalledOnce());
    const methodResponse = methodHarness.dispatch('/callback', 'POST');
    expect(methodResponse.writeHead).toHaveBeenCalledWith(
      405,
      expect.any(Object),
    );
    methodHarness.dispatch('/callback?state=csrf-state');
    await expect(methodResult).rejects.toThrow(
      'Threads authorization callback did not include a code.',
    );

    const reasonHarness = createCallbackHarness();
    const reasonResult = waitForThreadsAuthorizationCode(
      callbackOptions(reasonHarness),
    );
    await vi.waitFor(() => expect(reasonHarness.listen).toHaveBeenCalledOnce());
    reasonHarness.dispatch(
      '/callback?error=access_denied&error_reason=cancelled&state=csrf-state',
    );
    await expect(reasonResult).rejects.toThrow(
      'Threads authorization was rejected: cancelled',
    );

    const fallbackHarness = createCallbackHarness();
    const fallbackResult = waitForThreadsAuthorizationCode(
      callbackOptions(fallbackHarness),
    );
    await vi.waitFor(() =>
      expect(fallbackHarness.listen).toHaveBeenCalledOnce(),
    );
    fallbackHarness.dispatch('/callback?error=access_denied&state=csrf-state');
    await expect(fallbackResult).rejects.toThrow(
      'Threads authorization was rejected: access_denied',
    );
  });

  it('propagates readiness failures including non-Error values', async () => {
    const harness = createCallbackHarness();
    const options = callbackOptions(harness);
    options.onReady = vi.fn(async () => {
      throw 'browser failed';
    });

    await expect(waitForThreadsAuthorizationCode(options)).rejects.toThrow(
      'browser failed',
    );
    expect(harness.close).toHaveBeenCalledOnce();
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

  it('uses the real TLS file reader when only the server is injected', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'threads-callback-tls-'));
    temporaryDirectories.push(directory);
    const certPath = join(directory, 'cert.pem');
    const keyPath = join(directory, 'key.pem');
    await writeFile(certPath, 'cert-bytes');
    await writeFile(keyPath, 'key-bytes');
    const harness = createCallbackHarness();
    const options = callbackOptions(harness);
    options.tlsCertPath = certPath;
    options.tlsKeyPath = keyPath;
    delete options.readFileImpl;

    const result = waitForThreadsAuthorizationCode(options);
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());
    harness.dispatch('/callback?code=authorization-code&state=csrf-state');

    await expect(result).resolves.toBe('authorization-code');
  });

  it('treats a missing request URL as the server root', async () => {
    const harness = createCallbackHarness();
    const result = waitForThreadsAuthorizationCode(callbackOptions(harness));
    await vi.waitFor(() => expect(harness.listen).toHaveBeenCalledOnce());

    const missingUrl = harness.dispatch(undefined as never);
    expect(missingUrl.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    harness.dispatch('/callback?code=authorization-code&state=csrf-state');

    await expect(result).resolves.toBe('authorization-code');
  });

  it('rejects a server error that occurs before the timeout is installed', async () => {
    let errorListener: ((error: Error) => void) | undefined;
    const server = {
      listening: false,
      close: vi.fn(),
      once: vi.fn((event: string, listener: (error: Error) => void) => {
        if (event === 'error') errorListener = listener;
        return server;
      }),
      listen: vi.fn(() => {
        errorListener?.(new Error('bind failed'));
        return server;
      }),
    };
    const options = callbackOptions(createCallbackHarness());
    options.createServerImpl = vi.fn(() => server as never);

    await expect(waitForThreadsAuthorizationCode(options)).rejects.toThrow(
      'bind failed',
    );
    expect(server.close).not.toHaveBeenCalled();
  });
});

describe('Threads OAuth and secure session', () => {
  it('uses the default API base and global fetch for profile lookup', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ id: 'user-default', username: 'default-user' }),
    );
    vi.stubGlobal('fetch', fetchImpl);

    await expect(getThreadsProfile({ accessToken: 'token-default' })).resolves.toEqual({
      id: 'user-default',
      username: 'default-user',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('graph.threads.net');
  });

  it('uses the real clock and default API/fetch paths for a valid saved session', async () => {
    const sessionPath = await createSessionPath();
    const now = Date.now();
    const stored = session({ expiresAt: now + 30 * DAY_MS });
    await writeThreadsSession(stored, { sessionPath });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(validDebugResponse(now + 30 * DAY_MS))
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1', username: 'zap' }));
    vi.stubGlobal('fetch', fetchImpl);

    await expect(assertThreadsSessionReady({ sessionPath })).resolves.toMatchObject({
      profile: { id: 'user-1', username: 'zap' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('adopts a tester token from process env using default runtime dependencies', async () => {
    const sessionPath = await createSessionPath();
    vi.stubEnv('THREADS_ACCESS_TOKEN', 'env-tester-token');
    const now = Date.now();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(validDebugResponse(now + 30 * DAY_MS))
      .mockResolvedValueOnce(jsonResponse({ id: 'env-user', username: 'env-zap' }));
    vi.stubGlobal('fetch', fetchImpl);

    const ready = await ensureThreadsSession({ sessionPath });
    expect(ready).toMatchObject({
      session: { accessToken: 'env-tester-token' },
      profile: { id: 'env-user', username: 'env-zap' },
    });
  });

  it('uses platform browser commands when no opener is injected', async () => {
    const originalPlatform = process.platform;
    try {
      for (const [platform, executable] of [
        ['darwin', 'open'],
        ['win32', 'rundll32.exe'],
        ['linux', 'xdg-open'],
      ] as const) {
        Object.defineProperty(process, 'platform', {
          configurable: true,
          value: platform,
        });
        processMocks.spawn.mockImplementationOnce(() => {
          const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
          queueMicrotask(() => child.emit('spawn'));
          return child;
        });
        const sessionPath = await createSessionPath();
        const fetchImpl = vi.fn<typeof fetch>(async (request) => {
          const url = request as URL;
          if (url.pathname === '/oauth/access_token') {
            return jsonResponse({ access_token: 'short-token', user_id: 'user-1' });
          }
          if (url.pathname === '/access_token') {
            return jsonResponse({ access_token: 'long-token', expires_in: 60 * 24 * 60 * 60 });
          }
          if (url.pathname === '/debug_token') return validDebugResponse(NOW + 30 * DAY_MS);
          if (url.pathname === '/me') return jsonResponse({ id: 'user-1', username: 'zap' });
          throw new Error(`Unexpected ${url.pathname}`);
        });

        await ensureThreadsSession({
          sessionPath,
          env: TEST_ENV,
          apiBaseUrl: 'https://graph.threads.test',
          fetchImpl,
          now: () => NOW,
          createState: () => `state-${platform}`,
          waitForAuthorizationCode: async (input) => {
            await input.onReady();
            return `code-${platform}`;
          },
        });
        expect(processMocks.spawn).toHaveBeenLastCalledWith(
          executable,
          expect.any(Array),
          expect.objectContaining({ detached: true, stdio: 'ignore' }),
        );
      }
    } finally {
      Object.defineProperty(process, 'platform', {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it('rejects empty profile tokens and malformed profile responses', async () => {
    await expect(getThreadsProfile({ accessToken: '   ' })).rejects.toThrow(
      'A Threads access token is required.',
    );

    for (const [body, message] of [
      [null, 'invalid profile response'],
      [{ username: 'zap' }, 'profile response has no id'],
      [{ id: 'user-1' }, 'profile response has no username'],
    ] as const) {
      await expect(
        getThreadsProfile({
          accessToken: 'token',
          apiBaseUrl: 'https://graph.threads.test',
          fetchImpl: vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse(body)),
        }),
      ).rejects.toThrow(message);
    }
  });

  it('redacts access tokens from API errors', async () => {
    const accessToken = 'super-secret-token';
    await expect(
      getThreadsProfile({
        accessToken,
        apiBaseUrl: 'https://graph.threads.test',
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse(
            { error: { message: `token ${accessToken} was rejected` } },
            401,
          ),
        ),
      }),
    ).rejects.toThrow('token [REDACTED] was rejected');
  });

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

  it('uses global fetch for a refresh when no fetch implementation is injected', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session({ expiresAt: NOW + 6 * DAY_MS }), {
      sessionPath,
    });
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      if (url.pathname === '/refresh_access_token') {
        return jsonResponse({ access_token: 'refreshed-token', expires_in: 60 * 24 * 60 * 60 });
      }
      if (url.pathname === '/debug_token') return validDebugResponse(NOW + 30 * DAY_MS);
      if (url.pathname === '/me') return jsonResponse({ id: 'user-1', username: 'zap' });
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      assertThreadsSessionReady({ sessionPath, now: () => NOW }),
    ).resolves.toMatchObject({ session: { accessToken: 'refreshed-token' } });
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

  it('rewrites stored identity metadata when validation returns newer values', async () => {
    for (const overrides of [
      { expiresAt: NOW + 40 * DAY_MS },
      { userId: 'old-user' },
      { username: 'old-name' },
    ]) {
      const sessionPath = await createSessionPath();
      const stored = session(overrides);
      await writeThreadsSession(stored, { sessionPath });
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(validDebugResponse(NOW + 30 * DAY_MS))
        .mockResolvedValueOnce(
          jsonResponse({ id: 'user-1', username: 'zap' }),
        );

      const ready = await assertThreadsSessionReady({
        sessionPath,
        fetchImpl,
        now: () => NOW,
      });

      expect(ready.session).toEqual(session());
      await expect(readThreadsSession({ sessionPath })).resolves.toEqual(
        session(),
      );
    }
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

  it('wraps authorization-class API failures but preserves server failures', async () => {
    const sessionPath = await createSessionPath();
    await writeThreadsSession(session(), { sessionPath });

    await expect(
      assertThreadsSessionReady({
        sessionPath,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({ error: { message: 'forbidden' } }, 403),
        ),
        now: () => NOW,
      }),
    ).rejects.toThrow('The saved Threads session was rejected: Threads API 403');

    await expect(
      assertThreadsSessionReady({
        sessionPath,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
          jsonResponse({ error: { message: 'upstream down' } }, 500),
        ),
        now: () => NOW,
      }),
    ).rejects.toThrow('Threads API 500: upstream down');
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

  it('rejects a non-object long-lived token response', async () => {
    const sessionPath = await createSessionPath();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'short-token', user_id: 'user-1' }))
      .mockResolvedValueOnce(jsonResponse(null));

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        fetchImpl,
        now: () => NOW,
        createState: () => 'state',
        openBrowser: vi.fn(async () => undefined),
        waitForAuthorizationCode: vi.fn(async () => 'code'),
      }),
    ).rejects.toThrow('invalid long-lived token exchange response');
  });

  it('uses default OAuth API, fetch, and clock dependencies safely when globals are stubbed', async () => {
    const sessionPath = await createSessionPath();
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      if (url.pathname === '/oauth/access_token') {
        return jsonResponse({ access_token: 'short-token', user_id: 'user-1' });
      }
      if (url.pathname === '/access_token') {
        return jsonResponse({ access_token: 'long-token', expires_in: 60 * 24 * 60 * 60 });
      }
      if (url.pathname === '/debug_token') {
        return validDebugResponse(Date.now() + 30 * DAY_MS);
      }
      if (url.pathname === '/me') return jsonResponse({ id: 'user-1', username: 'zap' });
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: TEST_ENV,
        createState: () => 'state',
        openBrowser: vi.fn(async () => undefined),
        waitForAuthorizationCode: vi.fn(async () => 'code'),
      }),
    ).resolves.toMatchObject({ session: { accessToken: 'long-token' } });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('graph.threads.net');
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
      label: 'a non-numeric expiration',
      body: {
        data: {
          is_valid: true,
          expires_at: 'tomorrow',
          scopes: ['threads_basic', 'threads_content_publish'],
        },
      },
      message: 'access token is expired',
    },
    {
      label: 'a non-string scope entry',
      body: {
        data: {
          is_valid: true,
          expires_at: Math.floor((NOW + DAY_MS) / 1_000),
          scopes: ['threads_basic', 123],
        },
      },
      message: 'invalid token scope response',
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

  it('rejects non-object and individually malformed stored sessions', async () => {
    const invalidValues: unknown[] = [
      null,
      [],
      { ...session(), version: 2 },
      { ...session(), accessToken: ' ' },
      { ...session(), expiresAt: 'soon' },
      { ...session(), expiresAt: Number.NaN },
      { ...session(), expiresAt: 0 },
      { ...session(), userId: '' },
      { ...session(), username: '' },
    ];

    for (const value of invalidValues) {
      const sessionPath = await createSessionPath();
      await mkdir(join(sessionPath, '..'), { recursive: true });
      await writeFile(sessionPath, JSON.stringify(value), 'utf8');
      await expect(readThreadsSession({ sessionPath })).rejects.toThrow(
        'Invalid Threads session',
      );
    }
  });

  it('propagates non-ENOENT session read failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'threads-auth-directory-'));
    temporaryDirectories.push(directory);
    await expect(readThreadsSession({ sessionPath: directory })).rejects.toThrow();
  });

  it('validates OAuth configuration and redirect URI constraints', async () => {
    const sessionPath = await createSessionPath();
    const base = {
      sessionPath,
      fetchImpl: vi.fn<typeof fetch>(),
      createState: () => 'state',
      waitForAuthorizationCode: vi.fn(async () => 'code'),
      openBrowser: vi.fn(async () => undefined),
    };

    await expect(ensureThreadsSession({ ...base, env: {} })).rejects.toThrow(
      'THREADS_APP_ID is not configured',
    );

    for (const [redirectUri, message] of [
      ['not a url', 'must be a valid HTTPS URL'],
      ['http://threads-local.test/callback', 'must use HTTPS'],
      ['https://localhost/callback', 'custom hostname'],
      ['https://127.0.0.1/callback', 'custom hostname'],
      ['https://threads-local.test/callback?x=1', 'must not contain query'],
      ['https://threads-local.test/callback#frag', 'must not contain query'],
    ] as const) {
      await expect(
        ensureThreadsSession({
          ...base,
          env: { ...TEST_ENV, THREADS_REDIRECT_URI: redirectUri },
        }),
      ).rejects.toThrow(message);
    }

    await expect(
      ensureThreadsSession({
        ...base,
        env: TEST_ENV,
        createState: () => '   ',
      }),
    ).rejects.toThrow('Threads OAuth state generation returned an empty value');
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

describe('Threads Tester access token', () => {
  it('adopts THREADS_ACCESS_TOKEN without OAuth or redirect configuration', async () => {
    const sessionPath = await createSessionPath();
    const openBrowser = vi.fn(async () => undefined);
    const waitForAuthorizationCode = vi.fn(async () => 'unused-code');
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = request as URL;
      switch (url.pathname) {
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
      env: { THREADS_ACCESS_TOKEN: 'tester-token' },
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
      now: () => NOW,
      openBrowser,
      waitForAuthorizationCode,
    });

    expect(waitForAuthorizationCode).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
    expect(result).toEqual({
      session: {
        version: 1,
        accessToken: 'tester-token',
        expiresAt: NOW + 55 * DAY_MS,
        userId: 'user-1',
        username: 'zap',
      },
      profile: { id: 'user-1', username: 'zap' },
    });
    await expect(readThreadsSession({ sessionPath })).resolves.toEqual(
      result.session,
    );
  });

  it('rejects a Tester token that is missing threads_content_publish', async () => {
    const sessionPath = await createSessionPath();
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      if (url.pathname === '/debug_token') {
        return jsonResponse({
          data: {
            is_valid: true,
            expires_at: Math.floor((NOW + 55 * DAY_MS) / 1_000),
            scopes: ['threads_basic'],
          },
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    await expect(
      ensureThreadsSession({
        sessionPath,
        env: { THREADS_ACCESS_TOKEN: 'tester-token' },
        apiBaseUrl: 'https://graph.threads.test',
        fetchImpl,
        now: () => NOW,
      }),
    ).rejects.toThrow('threads_content_publish');
    await expect(readThreadsSession({ sessionPath })).resolves.toBeNull();
  });
});
