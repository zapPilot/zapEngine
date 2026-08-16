import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  assertThreadsSessionReady: vi.fn(),
}));

vi.mock('./threads-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./threads-auth.js')>()),
  assertThreadsSessionReady: authMocks.assertThreadsSessionReady,
}));

import { createThreadsPublisher, getThreadsProfile } from './threads.js';

const VIDEO_URL = 'https://media.example.com/episode-1.mp4';

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.assertThreadsSessionReady.mockResolvedValue({
    session: {
      version: 1,
      accessToken: 'saved-session-token',
      userId: 'user-1',
      username: 'zap',
      expiresAt: Date.now() + 60_000,
    },
    profile: { id: 'user-1', username: 'zap' },
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('getThreadsProfile', () => {
  it('validates the token through /me and returns the account username', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: 'user-1', username: 'zap' }));

    await expect(
      getThreadsProfile({
        accessToken: ' token-1 ',
        apiBaseUrl: 'https://graph.threads.test',
        fetchImpl,
      }),
    ).resolves.toEqual({ id: 'user-1', username: 'zap' });

    const url = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(url.origin + url.pathname).toBe('https://graph.threads.test/me');
    expect(url.searchParams.get('fields')).toBe('id,username');
  });

  it('rejects a missing token before calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      getThreadsProfile({ accessToken: '', fetchImpl }),
    ).rejects.toThrow('A Threads access token is required.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createThreadsPublisher', () => {
  it('creates, waits for, and publishes a native video container', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'container-1', status: 'IN_PROGRESS' }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'container-1', status: 'FINISHED' }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const sleep = vi.fn(async () => undefined);
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
      sleep,
      statusPollIntervalMs: 1,
    });

    await expect(
      publisher.publishThreads({ text: '市場更新', videoUrl: VIDEO_URL }),
    ).resolves.toMatchObject({ status: 'published', postId: 'thread-1' });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledOnce();

    const createUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(createUrl.origin + createUrl.pathname).toBe(
      'https://graph.threads.test/me/threads',
    );
    expect(createUrl.searchParams.get('media_type')).toBe('VIDEO');
    expect(createUrl.searchParams.get('video_url')).toBe(VIDEO_URL);
    expect(createUrl.searchParams.get('text')).toBe('市場更新');
    expect(createUrl.searchParams.has('link_attachment')).toBe(false);

    const statusUrl = fetchImpl.mock.calls[1]?.[0] as URL;
    expect(statusUrl.pathname).toBe('/container-1');
    expect(statusUrl.searchParams.get('fields')).toBe(
      'id,status,error_message',
    );

    const publishUrl = fetchImpl.mock.calls[3]?.[0] as URL;
    expect(publishUrl.pathname).toBe('/me/threads_publish');
    expect(publishUrl.searchParams.get('creation_id')).toBe('container-1');
  });

  it('uses the saved secure session when no credential option is provided', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'container-1', status: 'FINISHED' }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const publisher = createThreadsPublisher({ fetchImpl });

    await publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL });

    expect(authMocks.assertThreadsSessionReady).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer saved-session-token',
    });
  });

  it('accepts a null explicit token as missing credentials', async () => {
    const publisher = createThreadsPublisher({ accessToken: null as never });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads is not logged in');
  });

  it('fails the wait step when Threads rejects video processing', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'container-1',
            status: 'ERROR',
            error_message: 'Unsupported video',
          }),
        ),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: wait_video\nCause: Threads video container ERROR: Unsupported video',
    );
  });

  it('reports an expired container even when Threads omits the error detail', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 'container-1', status: 'EXPIRED' }),
        ),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads video container EXPIRED');
  });

  it('rejects unexpected container status and polling exhaustion', async () => {
    const unexpected = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 'container-1', status: 'QUEUED' }),
        ),
    });
    await expect(
      unexpected.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('unexpected status QUEUED');

    const sleep = vi.fn(async () => undefined);
    const exhausted = createThreadsPublisher({
      accessToken: 'token-1',
      statusPollAttempts: 1,
      sleep,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 'container-1', status: 'IN_PROGRESS' }),
        ),
    });
    await expect(
      exhausted.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('did not finish after 1 status checks');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails closed on malformed or non-HTTPS video URLs before calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl,
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: 'not a url' }),
    ).rejects.toThrow('Threads video URL must be a valid public HTTPS URL.');

    await expect(
      publisher.publishThreads({
        text: 'copy',
        videoUrl: 'http://media.example.com/video.mp4',
      }),
    ).rejects.toThrow('Threads video URL must be a valid public HTTPS URL.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a non-HTTPS video URL before calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl,
    });

    await expect(
      publisher.publishThreads({
        text: 'copy',
        videoUrl: 'http://media.example.com/video.mp4',
      }),
    ).rejects.toThrow('Threads video URL must be a valid public HTTPS URL.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails with a named credential step when the token is missing', async () => {
    const publisher = createThreadsPublisher({ accessToken: '' });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: credentials\nCause: Threads is not logged in. Run `pnpm social:login` first.',
    );
  });

  it('loads the secure session token when no explicit token is injected', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'container-1', status: 'FINISHED' }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const getAccessToken = vi.fn(async () => 'session-token');
    const publisher = createThreadsPublisher({ getAccessToken, fetchImpl });

    await publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL });

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer session-token',
    });
  });

  it('wraps platform video preparation failures in their named step', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      prepareVideoUrl: vi.fn().mockRejectedValue(new Error('teaser failed')),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: prepare_video\nCause: teaser failed',
    );
  });

  it('rejects a non-public URL returned by the video preparer', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      prepareVideoUrl: vi.fn(async () => 'http://private.example/video.mp4'),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads video URL must be a valid public HTTPS URL.');
  });

  it('points credential validation failures to the unified login command', async () => {
    const publisher = createThreadsPublisher({
      getAccessToken: vi.fn().mockRejectedValue(new Error('token revoked')),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: credentials\nCause: token revoked\nRun `pnpm social:login` to reconnect Threads.',
    );
  });

  it('preserves existing login guidance for Error and non-Error failures', async () => {
    for (const error of [
      new Error('Run `pnpm social:login` first'),
      'pnpm social:login required',
    ]) {
      const publisher = createThreadsPublisher({
        getAccessToken: vi.fn().mockRejectedValue(error),
      });
      await expect(
        publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
      ).rejects.toThrow(/pnpm social:login/u);
    }
  });

  it('normalizes non-Error credential failures before adding login guidance', async () => {
    const publisher = createThreadsPublisher({
      getAccessToken: vi.fn().mockRejectedValue('session lookup failed'),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('session lookup failed\nRun `pnpm social:login`');
  });

  it.each([
    ['non-object creation response', null, /invalid video container response/u],
    ['missing creation id', {}, /video container without an id/u],
    ['blank creation id', { id: '   ' }, /video container without an id/u],
  ])('rejects %s', async (_label, creationBody, message) => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(creationBody)),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(message);
  });

  it.each([
    ['non-object status response', null],
    ['missing status', { id: 'container-1' }],
    ['blank status', { id: 'container-1', status: '   ' }],
  ])('rejects %s', async (_label, statusBody) => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(jsonResponse(statusBody)),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('video container without a status');
  });

  it('rejects malformed published-post identifiers', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 'container-1', status: 'FINISHED' }),
        )
        .mockResolvedValueOnce(jsonResponse({ id: ' ' })),
    });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('published post without an id');
  });

  it('preserves the API error message and create step', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse(
            { error: { message: 'Invalid OAuth access token.' } },
            401,
          ),
        ),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: create_video\nCause: Threads API 401: Invalid OAuth access token.',
    );
  });

  it('uses the default sleeper between in-progress checks', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl,
      statusPollIntervalMs: 0,
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).resolves.toMatchObject({ postId: 'thread-1' });
  });

  it('times out after the configured number of status checks', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      statusPollAttempts: 1,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' })),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('did not finish after 1 status checks');
  });

  it.each(['QUEUED', 'PENDING'])('rejects unexpected container status %s', async (status) => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(jsonResponse({ status })),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(`unexpected status ${status}`);
  });

  it('reports an expired container even without an API detail', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'EXPIRED' })),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads video container EXPIRED');
  });

  it.each([
    ['invalid create response', null, 'invalid video container response'],
    ['missing create id', {}, 'video container without an id'],
  ])('rejects $0', async (_label, createBody, message) => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(createBody)),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow(message);
  });

  it.each([null, {}, { status: '' }])(
    'rejects a container response without a usable status %#',
    async (statusBody) => {
      const publisher = createThreadsPublisher({
        accessToken: 'token-1',
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
          .mockResolvedValueOnce(jsonResponse(statusBody)),
      });

      await expect(
        publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
      ).rejects.toThrow('without a status');
    },
  );

  it('rejects a published response without an id', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'FINISHED' }))
        .mockResolvedValueOnce(jsonResponse({})),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('published post without an id');
  });

  it('wraps invalid prepared video URLs in the prepare_video step', async () => {
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      prepareVideoUrl: vi.fn(async () => 'http://private.example/video.mp4'),
      fetchImpl: vi.fn<typeof fetch>(),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads video URL must be a valid public HTTPS URL.');
  });

  it('preserves login guidance from non-Error credential failures', async () => {
    const publisher = createThreadsPublisher({
      getAccessToken: vi.fn().mockRejectedValue('pnpm social:login failed'),
    });

    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('pnpm social:login failed');
  });

  it('treats a null injected token as missing instead of stringifying it', async () => {
    const publisher = createThreadsPublisher({ accessToken: null as never });
    await expect(
      publisher.publishThreads({ text: 'copy', videoUrl: VIDEO_URL }),
    ).rejects.toThrow('Threads is not logged in');
  });
});
