import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPodcastEpisode,
  fetchPodcastEpisodeSearchResults,
  fetchPodcastEpisodes,
  findPodcastEpisodeById,
  getPodcastApiUrl,
  getPodcastEpisodeShareUrl,
  isPodcastSearchQueryValid,
  normalisePodcastSearchQuery,
  parsePodcastEpisode,
  parsePodcastEpisodeSearchResult,
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

  it('parses detail fields from camelCase episode responses', () => {
    const parsed = parsePodcastEpisode(
      episode({
        script: 'Paragraph one. Paragraph two.',
        likeCount: 7,
        lastPositionSeconds: 42,
        video: {
          url: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
          durationSeconds: 91.5,
        },
        audioTracks: [
          {
            languageCode: 'zh-Hant',
            title: 'Main track',
            hlsUrl: 'https://cdn.example.com/main.m3u8',
            classroomHlsUrl: 'https://cdn.example.com/classroom.m3u8',
          },
        ],
        languageClassrooms: [
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'ja',
            oneLiner: 'Learn the macro word of the day.',
            keywords: [
              {
                term: '金利',
                reading: 'きんり',
                meaning: 'interest rate',
                note: 'Used in central bank news.',
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.script).toBe('Paragraph one. Paragraph two.');
    expect(parsed.likeCount).toBe(7);
    expect(parsed.lastPositionSeconds).toBe(42);
    expect(parsed.video).toEqual({
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 91.5,
    });
    expect(parsed.audioTracks[0]).toEqual({
      languageCode: 'zh-Hant',
      title: 'Main track',
      hlsUrl: 'https://cdn.example.com/main.m3u8',
      classroomHlsUrl: 'https://cdn.example.com/classroom.m3u8',
    });
    expect(parsed.languageClassrooms[0]?.keywords[0]?.term).toBe('金利');
  });

  it('parses detail fields from snake_case episode responses', () => {
    const parsed = parsePodcastEpisode({
      id: 'ep-2',
      localization_id: '',
      title: 'Liquidity cycle',
      language_code: 'en',
      hls_url: 'https://cdn.example.com/ep-2/playlist.m3u8',
      created_at: '2026-07-02T00:00:00.000Z',
      listened: true,
      script: 'Liquidity is moving.',
      like_count: 3,
      last_position_seconds: 21,
      video: {
        url: 'https://cdn.example.com/video-2.mp4',
        thumbnail_url: 'https://cdn.example.com/thumbnail-2.png',
        duration_seconds: 120,
      },
      audio_tracks: [
        {
          language_code: 'en',
          title: '',
          hls_url: 'https://cdn.example.com/en.m3u8',
          classroom_hls_url: null,
        },
      ],
      language_classrooms: [
        {
          source_language_code: 'en',
          target_language_code: 'zh-Hant',
          one_liner: 'Liquidity 的中文語感。',
          keywords: [{ term: 'liquidity', meaning: '流動性' }],
        },
      ],
    });

    expect(parsed.localizationId).toBe('ep-2');
    expect(parsed.audioTracks[0]?.title).toBe('en');
    expect(parsed.languageClassrooms[0]?.targetLanguageCode).toBe('zh-Hant');
    expect(parsed.video?.thumbnailUrl).toBe(
      'https://cdn.example.com/thumbnail-2.png',
    );
  });

  it('treats null or incomplete video payloads as audio-only episodes', () => {
    expect(parsePodcastEpisode(episode({ video: null })).video).toBeNull();
    expect(
      parsePodcastEpisode(
        episode({
          video: {
            url: 'https://cdn.example.com/video.mp4',
            thumbnailUrl: '',
            durationSeconds: 90,
          },
        }),
      ).video,
    ).toBeNull();
  });

  it('parses episode search results from camelCase responses', () => {
    const parsed = parsePodcastEpisodeSearchResult({
      episode: episode(),
      matchSource: 'script',
      snippet: 'The Fed says liquidity is changing.',
    });

    expect(parsed.episode.id).toBe('ep-1');
    expect(parsed.matchSource).toBe('script');
    expect(parsed.snippet).toBe('The Fed says liquidity is changing.');
  });

  it('parses episode search results from snake_case responses', () => {
    const parsed = parsePodcastEpisodeSearchResult({
      episode: episode({ id: 'ep-3' }),
      match_source: 'title',
      snippet: null,
    });

    expect(parsed.episode.id).toBe('ep-3');
    expect(parsed.matchSource).toBe('title');
    expect(parsed.snippet).toBeNull();
  });

  it('normalises and validates search queries', () => {
    expect(normalisePodcastSearchQuery('  fed  ')).toBe('fed');
    expect(isPodcastSearchQueryValid('f')).toBe(false);
    expect(isPodcastSearchQueryValid('fed')).toBe(true);
  });

  it('requests the search endpoint with language and query params', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            episode: episode(),
            matchSource: 'title',
            snippet: 'Fed rate decision explained',
          },
        ],
      }),
    );

    const results = await fetchPodcastEpisodeSearchResults(' fed ', fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/episodes/search');
    expect(url.searchParams.get('q')).toBe('fed');
    expect(url.searchParams.get('language')).toBe('zh-Hant');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(results[0]?.episode.id).toBe('ep-1');
  });

  it('skips the search request when the query is too short', async () => {
    const results = await fetchPodcastEpisodeSearchResults('f', fetchMock);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('drops search results without playable HLS urls', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          { episode: episode(), matchSource: 'title', snippet: null },
          {
            episode: episode({ id: 'ep-2', hlsUrl: '' }),
            matchSource: 'script',
            snippet: 'No audio yet',
          },
        ],
      }),
    );

    const results = await fetchPodcastEpisodeSearchResults('fed', fetchMock);

    expect(results.map((result) => result.episode.id)).toEqual(['ep-1']);
  });

  it('throws on a non-200 search response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(
      fetchPodcastEpisodeSearchResults('fed', fetchMock),
    ).rejects.toThrow('Podcast search request failed: 503');
  });

  it('finds an episode by id or localization id', () => {
    const episodes = [parsePodcastEpisode(episode())];

    expect(findPodcastEpisodeById(episodes, 'ep-1')?.title).toBe(
      'Fed rate decision explained',
    );
    expect(findPodcastEpisodeById(episodes, 'loc-1')?.id).toBe('ep-1');
    expect(findPodcastEpisodeById(episodes, 'missing')).toBeNull();
  });

  it('fetches one localization outside the latest feed page', async () => {
    fetchMock.mockResolvedValue(jsonResponse(episode()));

    const result = await fetchPodcastEpisode('loc/one', fetchMock, 'zh-Hant');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/episodes/loc%2Fone');
    expect(url.searchParams.get('language')).toBe('zh-Hant');
    expect(result.localizationId).toBe('loc-1');
  });

  it('throws on a non-200 single episode response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);

    await expect(fetchPodcastEpisode('missing', fetchMock)).rejects.toThrow(
      'Podcast episode request failed: 404',
    );
  });

  it('builds the canonical HTTPS episode share URL with language', () => {
    expect(getPodcastEpisodeShareUrl(parsePodcastEpisode(episode()))).toBe(
      'https://from-fed-to-chain-api.fly.dev/e/ep-1?lang=zh-Hant',
    );
  });
});
