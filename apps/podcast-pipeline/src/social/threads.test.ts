import { describe, expect, it, vi } from 'vitest';

import { createThreadsPublisher, getThreadsProfile } from './threads.js';

const VIDEO_URL = 'https://media.example.com/episode-1.mp4';

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
});
