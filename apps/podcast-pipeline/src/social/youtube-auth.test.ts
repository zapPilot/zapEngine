import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertYouTubeSessionReady,
  buildYouTubeAuthorizationUrl,
  ensureYouTubeSession,
  writeYouTubeSession,
  type YouTubeSession,
} from './youtube-auth.js';

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const directories: string[] = [];

afterEach(async () => {
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
});

async function sessionPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'zap-youtube-auth-'));
  directories.push(directory);
  return join(directory, 'session.json');
}
