import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  chmod: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));
const httpsMocks = vi.hoisted(() => ({
  createServer: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsMocks);
vi.mock('node:https', () => ({ createServer: httpsMocks.createServer }));

import {
  assertThreadsSessionReady,
  DEFAULT_THREADS_SESSION_PATH,
  ensureThreadsSession,
  readThreadsSession,
  type ThreadsSession,
  writeThreadsSession,
} from './threads-auth.js';

const session: ThreadsSession = {
  version: 1,
  accessToken: 'access',
  expiresAt: 2_000_000,
  userId: 'user-1',
  username: 'zap',
};

beforeEach(() => {
  vi.clearAllMocks();
  fsMocks.chmod.mockResolvedValue(undefined);
  fsMocks.mkdir.mockResolvedValue(undefined);
  fsMocks.rename.mockResolvedValue(undefined);
  fsMocks.unlink.mockResolvedValue(undefined);
  fsMocks.writeFile.mockResolvedValue(undefined);
});

describe('Threads session default filesystem wiring', () => {
  it('uses the default HTTPS callback waiter and default session path during first authorization', async () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    fsMocks.readFile.mockImplementation(async (path: string) => {
      if (path === DEFAULT_THREADS_SESSION_PATH) throw missing;
      if (path === '/tls/cert.pem') return Buffer.from('cert');
      if (path === '/tls/key.pem') return Buffer.from('key');
      throw new Error(`Unexpected read: ${path}`);
    });

    let callback:
      | ((
          request: { method?: string; url?: string },
          response: {
            writeHead(status: number, headers: Record<string, string>): unknown;
            end(body?: string): unknown;
          },
        ) => void)
      | undefined;
    const server = {
      listening: false,
      close: vi.fn(),
      once: vi.fn().mockReturnThis(),
      listen: vi.fn((_port: number, _host: string, ready: () => void) => {
        server.listening = true;
        ready();
        return server;
      }),
    };
    httpsMocks.createServer.mockImplementation((_options, listener) => {
      callback = listener;
      return server;
    });

    const openBrowser = vi.fn(async (authorizationUrl: string) => {
      const state = new URL(authorizationUrl).searchParams.get('state');
      callback?.(
        {
          method: 'GET',
          url: `/callback?code=authorization-code&state=${state}`,
        },
        { writeHead: vi.fn(), end: vi.fn() },
      );
    });
    const now = Date.UTC(2026, 7, 15);
    const fetchImpl = vi.fn<typeof fetch>(async (request) => {
      const url = request as URL;
      if (url.pathname === '/oauth/access_token') {
        return new Response(
          JSON.stringify({ access_token: 'short-token', user_id: 'user-1' }),
          { status: 200 },
        );
      }
      if (url.pathname === '/access_token') {
        return new Response(
          JSON.stringify({
            access_token: 'long-token',
            token_type: 'bearer',
            expires_in: 5_184_000,
          }),
          { status: 200 },
        );
      }
      if (url.pathname === '/debug_token') {
        return new Response(
          JSON.stringify({
            data: {
              is_valid: true,
              expires_at: Math.floor((now + 5_184_000_000) / 1_000),
              scopes: ['threads_basic', 'threads_content_publish'],
            },
          }),
          { status: 200 },
        );
      }
      if (url.pathname === '/me') {
        return new Response(JSON.stringify({ id: 'user-1', username: 'zap' }), {
          status: 200,
        });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    const result = await ensureThreadsSession({
      env: {
        THREADS_APP_ID: 'app-123',
        THREADS_APP_SECRET: 'app-secret',
        THREADS_REDIRECT_URI: 'https://threads-local.test:8443/callback',
        THREADS_TLS_CERT_PATH: '/tls/cert.pem',
        THREADS_TLS_KEY_PATH: '/tls/key.pem',
      },
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
      now: () => now,
      createState: () => 'csrf-state',
      openBrowser,
    });

    expect(result.session.accessToken).toBe('long-token');
    expect(httpsMocks.createServer).toHaveBeenCalledOnce();
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`${DEFAULT_THREADS_SESSION_PATH}.tmp-`),
      expect.any(String),
      expect.objectContaining({ encoding: 'utf8', flag: 'wx', mode: 0o600 }),
    );
    expect(fsMocks.rename).toHaveBeenCalledWith(
      expect.stringContaining(`${DEFAULT_THREADS_SESSION_PATH}.tmp-`),
      DEFAULT_THREADS_SESSION_PATH,
    );
  });
  it('reads the default session path and treats ENOENT as logged out', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(readThreadsSession()).resolves.toBeNull();
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_THREADS_SESSION_PATH,
      'utf8',
    );
  });

  it('uses the default session path when checking login readiness', async () => {
    fsMocks.readFile.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(assertThreadsSessionReady()).rejects.toThrow(
      'Threads is not logged in',
    );
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      DEFAULT_THREADS_SESSION_PATH,
      'utf8',
    );
  });

  it('surfaces a non-ENOENT temporary-file cleanup failure on the default path', async () => {
    fsMocks.unlink.mockRejectedValue(
      Object.assign(new Error('cleanup denied'), { code: 'EACCES' }),
    );

    await expect(writeThreadsSession(session)).rejects.toThrow(
      'cleanup denied',
    );
    expect(fsMocks.rename).toHaveBeenCalledWith(
      expect.stringContaining(`${DEFAULT_THREADS_SESSION_PATH}.tmp-`),
      DEFAULT_THREADS_SESSION_PATH,
    );
  });
});
