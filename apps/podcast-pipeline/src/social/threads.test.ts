import { describe, expect, it, vi } from 'vitest';

import { createThreadsPublisher, getThreadsProfile } from './threads.js';

const EPISODE_URL = 'https://example.com/e/episode-1';

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
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
  });

  it('rejects a missing token before calling the API', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      getThreadsProfile({ accessToken: '', fetchImpl }),
    ).rejects.toThrow('A Threads access token is required.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a malformed profile response', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: 'user-1' }));

    await expect(
      getThreadsProfile({ accessToken: 'token-1', fetchImpl }),
    ).rejects.toThrow('Threads API profile response has no username.');
  });
});

describe('createThreadsPublisher', () => {
  it('auto-publishes a text post with the episode link attached', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const publisher = createThreadsPublisher({
      accessToken: 'token-1',
      apiBaseUrl: 'https://graph.threads.test',
      fetchImpl,
    });

    const result = await publisher.publishThreads({
      text: '市場更新',
      episodeUrl: EPISODE_URL,
    });

    expect(result).toMatchObject({
      status: 'published',
      postId: 'thread-1',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const publishUrl = fetchImpl.mock.calls[0]?.[0] as URL;
    expect(publishUrl.origin + publishUrl.pathname).toBe(
      'https://graph.threads.test/me/threads',
    );
    expect(publishUrl.searchParams.get('media_type')).toBe('TEXT');
    expect(publishUrl.searchParams.get('text')).toBe('市場更新');
    expect(publishUrl.searchParams.get('link_attachment')).toBe(EPISODE_URL);
    expect(publishUrl.searchParams.get('auto_publish_text')).toBe('true');
    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
  });

  it('fails with a named credential step when the token is missing', async () => {
    const publisher = createThreadsPublisher({ accessToken: '' });

    await expect(
      publisher.publishThreads({ text: 'copy', episodeUrl: EPISODE_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: credentials\nCause: Threads is not logged in. Run `pnpm social:login` first.',
    );
  });

  it('loads the secure session token when no explicit token is injected', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: 'thread-1' }));
    const getAccessToken = vi.fn(async () => 'session-token');
    const publisher = createThreadsPublisher({
      getAccessToken,
      fetchImpl,
    });

    await publisher.publishThreads({
      text: 'copy',
      episodeUrl: EPISODE_URL,
    });

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
      publisher.publishThreads({ text: 'copy', episodeUrl: EPISODE_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: credentials\nCause: token revoked\nRun `pnpm social:login` to reconnect Threads.',
    );
  });

  it('preserves the API error message and failed step', async () => {
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
      publisher.publishThreads({ text: 'copy', episodeUrl: EPISODE_URL }),
    ).rejects.toThrow(
      'THREADS_PUBLISH_FAILED\nStep: publish\nCause: Threads API 401: Invalid OAuth access token.',
    );
  });
});
