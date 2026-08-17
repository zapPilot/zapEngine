import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: processMocks.spawn,
}));

import {
  assertYouTubeSessionReady,
  buildYouTubeAuthorizationUrl,
  ensureYouTubeSession,
  readYouTubeSession,
  waitForYouTubeAuthorizationCode,
  writeYouTubeSession,
  type YouTubeSession,
} from './youtube-auth.js';

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  processMocks.spawn.mockReset();
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('YouTube OAuth', () => {
  it('builds a least-privilege desktop authorization URL', () => {
    const url = new URL(
      buildYouTubeAuthorizationUrl({
        clientId: 'client-id',
        redirectUri: 'http://127.0.0.1:54321',
        state: 'state-1',
      }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('scope')).toBe(UPLOAD_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('rejects a stored session that is missing an explicitly required extra scope', async () => {
    const path = await sessionPath();
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 2_000_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );

    await expect(
      assertYouTubeSessionReady({
        sessionPath: path,
        now: () => 1_000_000,
        additionalScopes: ['openid'],
      }),
    ).rejects.toThrow('missing required scopes: openid');
  });

  it('reuses an unexpired stored session without opening OAuth', async () => {
    const path = await sessionPath();
    const session: YouTubeSession = {
      version: 1,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 2_000_000,
      scope: UPLOAD_SCOPE,
    };
    await writeYouTubeSession(session, { sessionPath: path });
    const openBrowser = vi.fn<(url: string) => Promise<void>>(
      async () => undefined,
    );

    await expect(
      assertYouTubeSessionReady({
        sessionPath: path,
        now: () => 1_000_000,
        openBrowser,
      }),
    ).resolves.toEqual(session);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('runs loopback OAuth and persists the refresh token', async () => {
    const path = await sessionPath();
    const openBrowser = vi.fn<(url: string) => Promise<void>>(
      async () => undefined,
    );
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            expires_in: 3600,
            scope: UPLOAD_SCOPE,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );

    const session = await ensureYouTubeSession({
      env: {
        YOUTUBE_CLIENT_ID: 'client-id',
        YOUTUBE_CLIENT_SECRET: 'client-secret',
      },
      fetchImpl,
      now: () => 1_000_000,
      openBrowser,
      sessionPath: path,
      createState: () => 'state-1',
      waitForAuthorizationCode: async (input) => {
        await input.onReady('http://127.0.0.1:54321');
        return { code: 'code-1', redirectUri: 'http://127.0.0.1:54321' };
      },
    });

    expect(openBrowser).toHaveBeenCalledOnce();
    expect(
      new URL(openBrowser.mock.calls[0]![0]).searchParams.get('scope'),
    ).toBe(UPLOAD_SCOPE);
    expect(session.refreshToken).toBe('refresh-1');
    const stored = JSON.parse(await readFile(path, 'utf8')) as YouTubeSession;
    expect(stored.refreshToken).toBe('refresh-1');
  });

  it('returns null for a missing session and rejects malformed stored sessions', async () => {
    const path = await sessionPath();

    await expect(readYouTubeSession({ sessionPath: path })).resolves.toBeNull();

    await writeFile(path, '{broken json', 'utf8');
    await expect(readYouTubeSession({ sessionPath: path })).rejects.toThrow(
      'Invalid YouTube session',
    );

    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        accessToken: '',
        refreshToken: 'refresh',
        expiresAt: 2_000_000,
        scope: UPLOAD_SCOPE,
      }),
      'utf8',
    );
    await expect(readYouTubeSession({ sessionPath: path })).rejects.toThrow(
      'Invalid YouTube session',
    );

    for (const value of [
      null,
      [],
      {
        version: 2,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 1,
        scope: UPLOAD_SCOPE,
      },
      {
        version: 1,
        accessToken: 'a',
        refreshToken: '',
        expiresAt: 1,
        scope: UPLOAD_SCOPE,
      },
      {
        version: 1,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 0,
        scope: UPLOAD_SCOPE,
      },
      {
        version: 1,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Number.NaN,
        scope: UPLOAD_SCOPE,
      },
      {
        version: 1,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 1,
        scope: '',
      },
    ]) {
      await writeFile(path, JSON.stringify(value), 'utf8');
      await expect(readYouTubeSession({ sessionPath: path })).rejects.toThrow(
        'Invalid YouTube session',
      );
    }
  });

  it('propagates non-ENOENT session read failures and reports missing login', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-directory-'));
    directories.push(directory);
    await expect(
      readYouTubeSession({ sessionPath: directory }),
    ).rejects.toThrow();

    const path = join(directory, 'missing.json');
    await expect(
      assertYouTubeSessionReady({ sessionPath: path }),
    ).rejects.toThrow('YouTube is not logged in');
  });

  it('uses the real clock for a fresh stored session', async () => {
    const path = await sessionPath();
    const session: YouTubeSession = {
      version: 1,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60 * 60_000,
      scope: UPLOAD_SCOPE,
    };
    await writeYouTubeSession(session, { sessionPath: path });
    await expect(
      assertYouTubeSessionReady({ sessionPath: path }),
    ).resolves.toEqual(session);
  });

  it('rethrows ordinary refresh configuration failures instead of starting OAuth', async () => {
    const path = await sessionPath();
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'access-old',
        refreshToken: 'refresh-old',
        expiresAt: 1_100_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );

    await expect(
      ensureYouTubeSession({
        sessionPath: path,
        now: () => 1_000_000,
        env: {},
      }),
    ).rejects.toThrow(
      'YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not configured',
    );
  });

  it('uses process env, secure state, global fetch, and the real clock during authorization', async () => {
    const path = await sessionPath();
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'env-client');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'env-secret');
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'global-access',
            refresh_token: 'global-refresh',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchImpl);
    const waiter = vi.fn(async (input) => {
      expect(input.expectedState).toMatch(/^[A-Za-z0-9_-]+$/u);
      return { code: 'code-env', redirectUri: 'http://127.0.0.1:54321' };
    });

    const result = await ensureYouTubeSession({
      sessionPath: path,
      waitForAuthorizationCode: waiter,
    });

    expect(result).toMatchObject({
      accessToken: 'global-access',
      refreshToken: 'global-refresh',
      scope: UPLOAD_SCOPE,
    });
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses process env and global fetch during token refresh', async () => {
    const path = await sessionPath();
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'env-client');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'env-secret');
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'old',
        refreshToken: 'refresh',
        expiresAt: 1_100_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'new', expires_in: 3600 }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchImpl);

    await expect(
      assertYouTubeSessionReady({ sessionPath: path, now: () => 1_000_000 }),
    ).resolves.toMatchObject({ accessToken: 'new' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses the built-in loopback waiter when one is not injected', async () => {
    const path = await sessionPath();
    const tokenFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-loopback',
            refresh_token: 'refresh-loopback',
            expires_in: 3600,
            scope: UPLOAD_SCOPE,
          }),
          { status: 200 },
        ),
    );
    const openBrowser = vi.fn(async (authorizationUrl: string) => {
      const url = new URL(authorizationUrl);
      const redirectUri = url.searchParams.get('redirect_uri')!;
      const state = url.searchParams.get('state')!;
      const response = await fetch(
        `${redirectUri}/?state=${encodeURIComponent(state)}&code=loopback-code`,
      );
      expect(response.status).toBe(200);
    });

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'loopback-state',
        fetchImpl: tokenFetch,
        openBrowser,
        sessionPath: path,
        callbackTimeoutMs: 2_000,
      }),
    ).resolves.toMatchObject({ accessToken: 'access-loopback' });
    expect(openBrowser).toHaveBeenCalledOnce();
  });

  it('uses platform browser commands when no browser opener is injected', async () => {
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
        const path = await sessionPath();
        await ensureYouTubeSession({
          env: {
            YOUTUBE_CLIENT_ID: 'client-id',
            YOUTUBE_CLIENT_SECRET: 'client-secret',
          },
          createState: () => `state-${platform}`,
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                access_token: `access-${platform}`,
                refresh_token: `refresh-${platform}`,
                expires_in: 3600,
                scope: UPLOAD_SCOPE,
              }),
              { status: 200 },
            ),
          sessionPath: path,
          waitForAuthorizationCode: async (input) => {
            await input.onReady('http://127.0.0.1:54321');
            return {
              code: `code-${platform}`,
              redirectUri: 'http://127.0.0.1:54321',
            };
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

  it('refreshes an expiring session and keeps the existing refresh token', async () => {
    const path = await sessionPath();
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'access-old',
        refreshToken: 'refresh-old',
        expiresAt: 1_100_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-new',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );

    const session = await assertYouTubeSessionReady({
      env: {
        YOUTUBE_CLIENT_ID: 'client-id',
        YOUTUBE_CLIENT_SECRET: 'client-secret',
      },
      fetchImpl,
      now: () => 1_000_000,
      sessionPath: path,
    });

    expect(session).toMatchObject({
      accessToken: 'access-new',
      refreshToken: 'refresh-old',
      scope: UPLOAD_SCOPE,
    });
    const request = fetchImpl.mock.calls[0]![1]!;
    expect(String(request.body)).toContain('grant_type=refresh_token');
    expect(String(request.body)).toContain('refresh_token=refresh-old');
    await expect(readYouTubeSession({ sessionPath: path })).resolves.toEqual(
      session,
    );
  });

  it('accepts replacement refresh token and scope from refresh responses', async () => {
    const path = await sessionPath();
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'access-old',
        refreshToken: 'refresh-old',
        expiresAt: 1_100_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );
    const session = await assertYouTubeSessionReady({
      env: {
        YOUTUBE_CLIENT_ID: 'client-id',
        YOUTUBE_CLIENT_SECRET: 'client-secret',
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 3600,
            scope: `${UPLOAD_SCOPE} openid`,
          }),
          { status: 200 },
        ),
      now: () => 1_000_000,
      sessionPath: path,
    });
    expect(session.refreshToken).toBe('refresh-new');
    expect(session.scope).toContain('openid');
  });

  it('turns a rejected refresh token into a reconnect error', async () => {
    const path = await sessionPath();
    await writeYouTubeSession(
      {
        version: 1,
        accessToken: 'access-old',
        refreshToken: 'refresh-old',
        expiresAt: 1_100_000,
        scope: UPLOAD_SCOPE,
      },
      { sessionPath: path },
    );

    await expect(
      assertYouTubeSessionReady({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Token has been revoked',
            }),
            { status: 401 },
          ),
        now: () => 1_000_000,
        sessionPath: path,
      }),
    ).rejects.toThrow(
      'The saved YouTube session was rejected: Google OAuth 401 invalid_grant: Token has been revoked',
    );
  });

  it('preserves non-authorization refresh failures and formats OAuth error variants', async () => {
    const makePath = async (): Promise<string> => {
      const path = await sessionPath();
      await writeYouTubeSession(
        {
          version: 1,
          accessToken: 'access-old',
          refreshToken: 'refresh-old',
          expiresAt: 1_100_000,
          scope: UPLOAD_SCOPE,
        },
        { sessionPath: path },
      );
      return path;
    };

    for (const [body, expected] of [
      [
        { error_description: 'service unavailable' },
        'Google OAuth 500: service unavailable',
      ],
      [{ error: 'server_error' }, 'Google OAuth 500: server_error'],
      ['plain failure', 'Google OAuth request failed with HTTP 500'],
      ['', 'Google OAuth request failed with HTTP 500'],
    ] as const) {
      const path = await makePath();
      await expect(
        assertYouTubeSessionReady({
          env: {
            YOUTUBE_CLIENT_ID: 'client-id',
            YOUTUBE_CLIENT_SECRET: 'client-secret',
          },
          fetchImpl: async () =>
            new Response(
              typeof body === 'string' ? body : JSON.stringify(body),
              { status: 500 },
            ),
          now: () => 1_000_000,
          sessionPath: path,
        }),
      ).rejects.toThrow(expected);
    }
  });

  it('validates OAuth configuration, generated state, token shape, and upload scope', async () => {
    const path = await sessionPath();
    const waiter = vi.fn(async () => ({
      code: 'code-1',
      redirectUri: 'http://127.0.0.1:54321',
    }));

    await expect(
      ensureYouTubeSession({
        env: {},
        sessionPath: path,
      }),
    ).rejects.toThrow(
      'YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not configured',
    );
    await expect(
      ensureYouTubeSession({
        env: { YOUTUBE_CLIENT_ID: 'client-id' },
        sessionPath: path,
      }),
    ).rejects.toThrow('YOUTUBE_CLIENT_SECRET is not configured');

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => '   ',
        sessionPath: path,
      }),
    ).rejects.toThrow('YouTube OAuth state generation returned an empty value');

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'state-1',
        fetchImpl: async () =>
          new Response(JSON.stringify(['unexpected']), { status: 200 }),
        sessionPath: path,
        waitForAuthorizationCode: waiter,
      }),
    ).rejects.toThrow('Google OAuth returned a non-object token response');

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'state-1',
        fetchImpl: async () =>
          new Response(JSON.stringify({ access_token: 'access-only' }), {
            status: 200,
          }),
        sessionPath: path,
        waitForAuthorizationCode: waiter,
      }),
    ).rejects.toThrow(
      'Google OAuth token response is missing access_token or expires_in',
    );

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'state-1',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-1',
              expires_in: 3600,
              scope: UPLOAD_SCOPE,
            }),
            { status: 200 },
          ),
        sessionPath: path,
        waitForAuthorizationCode: waiter,
      }),
    ).rejects.toThrow('Google did not return a YouTube refresh token');

    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'state-1',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-1',
              refresh_token: 'refresh-1',
              expires_in: 3600,
              scope: 'openid',
            }),
            { status: 200 },
          ),
        sessionPath: path,
        waitForAuthorizationCode: waiter,
      }),
    ).rejects.toThrow('does not include the youtube.upload scope');

    const successPath = await sessionPath();
    await expect(
      ensureYouTubeSession({
        env: {
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        },
        createState: () => 'state-2',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              access_token: 'access-default-scope',
              refresh_token: 'refresh-default-scope',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
        now: () => 5_000,
        sessionPath: successPath,
        waitForAuthorizationCode: waiter,
      }),
    ).resolves.toMatchObject({ scope: UPLOAD_SCOPE });
  });

  it('accepts a valid loopback callback after ignoring unrelated requests', async () => {
    const result = await waitForYouTubeAuthorizationCode({
      expectedState: 'state-1',
      timeoutMs: 2_000,
      onReady: async (redirectUri) => {
        const unrelated = await fetch(`${redirectUri}/health`);
        expect(unrelated.status).toBe(404);
        const callback = await fetch(
          `${redirectUri}/?state=state-1&code=${encodeURIComponent(' code-1 ')}`,
        );
        expect(callback.status).toBe(200);
      },
    });

    expect(result.code).toBe('code-1');
    expect(result.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
  });

  it('rejects a loopback callback with a mismatched state', async () => {
    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 2_000,
        onReady: async (redirectUri) => {
          const response = await fetch(
            `${redirectUri}/?state=wrong-state&code=code-1`,
          );
          expect(response.status).toBe(400);
        },
      }),
    ).rejects.toThrow('YouTube OAuth callback state did not match');
  });

  it('rejects OAuth denial and missing authorization codes', async () => {
    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 2_000,
        onReady: async (redirectUri) => {
          const response = await fetch(
            `${redirectUri}/?error=access_denied&state=state-1`,
          );
          expect(response.status).toBe(400);
        },
      }),
    ).rejects.toThrow('YouTube OAuth returned access_denied');

    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 2_000,
        onReady: async (redirectUri) => {
          const response = await fetch(`${redirectUri}/?state=state-1`);
          expect(response.status).toBe(400);
        },
      }),
    ).rejects.toThrow('YouTube OAuth callback did not include a code');
  });

  it('times out when no loopback callback arrives', async () => {
    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 10,
        onReady: async () => undefined,
      }),
    ).rejects.toThrow('Timed out waiting for YouTube authorization');
  });

  it('normalizes non-Error callback setup failures', async () => {
    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 2_000,
        onReady: async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately a non-Error throw, the subject under test
          throw 'browser string failure';
        },
      }),
    ).rejects.toThrow('browser string failure');
  });

  it('propagates callback setup failures', async () => {
    await expect(
      waitForYouTubeAuthorizationCode({
        expectedState: 'state-1',
        timeoutMs: 2_000,
        onReady: async () => {
          throw new Error('browser launch failed');
        },
      }),
    ).rejects.toThrow('browser launch failed');
  });
});

async function sessionPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-auth-'));
  directories.push(directory);
  return join(directory, 'session.json');
}
