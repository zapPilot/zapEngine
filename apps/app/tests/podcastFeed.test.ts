import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPodcastEpisodes,
  getPodcastApiUrl,
} from '@/integration/podcastFeed';

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function episode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep-1',
    localizationId: 'loc-1',
    title: 'Fed rate decision explained',
    languageCode: 'zh-Hant',
    hlsUrl: 'https://cdn.example.com/ep-1/playlist.m3u8',
    createdAt: '2026-07-01T00:00:00.000Z',
    listened: false,
    ...overrides,
  };
}

describe('podcast feed client', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env['VITE_PODCAST_API_URL'];
  });

  afterEach(() => {
    delete process.env['VITE_PODCAST_API_URL'];
  });

  it('defaults to the From Fed to Chain API host', () => {
    expect(getPodcastApiUrl()).toBe('https://from-fed-to-chain-api.fly.dev');
  });

  it('honors VITE_PODCAST_API_URL and strips a trailing slash', () => {
    process.env['VITE_PODCAST_API_URL'] = 'http://localhost:3000/';
    expect(getPodcastApiUrl()).toBe('http://localhost:3000');
  });

  it('requests the zh-Hant feed page and returns its items', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [episode()], nextCursor: null }),
    );

    const episodes = await fetchPodcastEpisodes(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin).toBe('https://from-fed-to-chain-api.fly.dev');
    expect(url.pathname).toBe('/episodes');
    expect(url.searchParams.get('limit')).toBe('30');
    expect(url.searchParams.get('language')).toBe('zh-Hant');
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.title).toBe('Fed rate decision explained');
  });

  it('drops episodes without a playable HLS url', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [episode(), episode({ id: 'ep-2', hlsUrl: '' })],
        nextCursor: null,
      }),
    );

    const episodes = await fetchPodcastEpisodes(fetchMock);

    expect(episodes.map((item) => item.id)).toEqual(['ep-1']);
  });

  it('throws on a non-200 feed response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 } as Response);

    await expect(fetchPodcastEpisodes(fetchMock)).rejects.toThrow(
      'Podcast feed request failed: 502',
    );
  });
});
