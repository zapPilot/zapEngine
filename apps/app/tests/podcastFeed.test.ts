import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPodcastCatalog,
  fetchPodcastEpisode,
  fetchPodcastEpisodeSearchResults,
  fetchPodcastEpisodes,
  findPodcastEpisodeById,
  getPodcastApiUrl,
  getPodcastEpisodeShareUrl,
  isPodcastSearchQueryValid,
  isPodcastVideoGenerationPending,
  mergePodcastEpisodeVideo,
  normalisePodcastSearchQuery,
  parsePodcastAudioTrack,
  parsePodcastClassroomTrack,
  parsePodcastEpisode,
  parsePodcastEpisodeSearchResult,
  podcastVideoRefetchInterval,
} from '@/integration/podcastFeed';
import {
  createPodcastEpisodeFactory,
  createPodcastVideoGeneration,
} from './support/podcastEpisode';

const fetchMock = vi.fn();

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

const episode = createPodcastEpisodeFactory({
  id: 'ep-1',
  localizationId: 'loc-1',
  title: 'Fed rate decision explained',
  hlsUrl: 'https://cdn.example.com/ep-1/playlist.m3u8',
  createdAt: '2026-07-01T00:00:00.000Z',
});

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

  it('requests the catalog and accepts only known language string arrays', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        languages: {
          en: ['loc-en-1', 'loc-en-2'],
          'zh-Hant': 'loc-zh-1',
          ja: ['loc-ja-1', 2],
          fr: ['loc-fr-1'],
        },
      }),
    );

    const catalog = await fetchPodcastCatalog(fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/episodes/catalog');
    expect(catalog).toEqual({
      languages: { en: ['loc-en-1', 'loc-en-2'] },
    });
  });

  it('degrades a malformed catalog payload to an empty language map', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ languages: null }));

    await expect(fetchPodcastCatalog(fetchMock)).resolves.toEqual({
      languages: {},
    });
  });

  it('throws on a non-200 catalog response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchPodcastCatalog(fetchMock)).rejects.toThrow(
      'Podcast catalog request failed: 503',
    );
  });

  it('parses detail fields from camelCase episode responses', () => {
    const parsed = parsePodcastEpisode(
      episode({
        script: 'Paragraph one. Paragraph two.',
        likeCount: 7,
        listened: true,
        lastPositionSeconds: 42,
        video: {
          url: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
          durationSeconds: 91.5,
        },
        videoGeneration: {
          status: 'completed',
          updatedAt: '2026-07-01T00:05:00.000Z',
          progressPercent: 100,
          stage: null,
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
    expect(parsed.listened).toBe(false);
    expect(parsed.lastPositionSeconds).toBe(0);
    expect(parsed.video).toEqual({
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 91.5,
    });
    expect(parsed.videoGeneration).toEqual({
      status: 'completed',
      updatedAt: '2026-07-01T00:05:00.000Z',
      progressPercent: 100,
      stage: null,
    });
    expect(parsed.audioTracks[0]).toEqual({
      languageCode: 'zh-Hant',
      title: 'Main track',
      hlsUrl: 'https://cdn.example.com/main.m3u8',
      classroomHlsUrl: 'https://cdn.example.com/classroom.m3u8',
      classrooms: [],
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
      video_generation: {
        status: 'processing',
        updated_at: '2026-07-02T00:05:00.000Z',
        progress_percent: 78,
        progress_stage: 'encoding',
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
    expect(parsed.listened).toBe(false);
    expect(parsed.lastPositionSeconds).toBe(0);
    expect(parsed.audioTracks[0]?.title).toBe('en');
    expect(parsed.languageClassrooms[0]?.targetLanguageCode).toBe('zh-Hant');
    expect(parsed.video?.thumbnailUrl).toBe(
      'https://cdn.example.com/thumbnail-2.png',
    );
    expect(parsed.videoGeneration).toEqual({
      status: 'processing',
      updatedAt: '2026-07-02T00:05:00.000Z',
      progressPercent: 78,
      stage: 'encoding',
    });
  });

  it('parses per-language classroom tracks with dual-key field names', () => {
    expect(
      parsePodcastAudioTrack({
        languageCode: 'zh-Hant',
        title: 'Main track',
        hlsUrl: 'https://cdn.example.com/main.m3u8',
        classroomHlsUrl: null,
        classrooms: [
          { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
          { language_code: 'en', hls_url: 'https://cdn.example.com/en.m3u8' },
        ],
      }),
    ).toEqual({
      languageCode: 'zh-Hant',
      title: 'Main track',
      hlsUrl: 'https://cdn.example.com/main.m3u8',
      classroomHlsUrl: null,
      classrooms: [
        { languageCode: 'ja', hlsUrl: 'https://cdn.example.com/ja.m3u8' },
        { languageCode: 'en', hlsUrl: 'https://cdn.example.com/en.m3u8' },
      ],
    });
  });

  it('drops malformed classroom track entries and defaults to an empty list', () => {
    expect(
      parsePodcastAudioTrack({
        languageCode: 'zh-Hant',
        title: 'Main track',
        hlsUrl: 'https://cdn.example.com/main.m3u8',
        classrooms: [
          { languageCode: 'ja' }, // missing hlsUrl
          { hlsUrl: 'https://cdn.example.com/orphan.m3u8' }, // missing languageCode
          { languageCode: 'en', hlsUrl: '   ' }, // blank hlsUrl
          null,
          'not an object',
        ],
      }),
    ).toMatchObject({ classrooms: [] });

    expect(
      parsePodcastAudioTrack({
        languageCode: 'zh-Hant',
        title: 'Main track',
        hlsUrl: 'https://cdn.example.com/main.m3u8',
      }),
    ).toMatchObject({ classrooms: [] });
  });

  it('parses a single classroom track entry directly', () => {
    expect(
      parsePodcastClassroomTrack({
        languageCode: 'ja',
        hlsUrl: 'https://cdn.example.com/ja.m3u8',
      }),
    ).toEqual({
      languageCode: 'ja',
      hlsUrl: 'https://cdn.example.com/ja.m3u8',
    });
    expect(parsePodcastClassroomTrack({ languageCode: 'ja' })).toBeNull();
    expect(
      parsePodcastClassroomTrack({
        languageCode: '',
        hlsUrl: 'https://cdn.example.com/ja.m3u8',
      }),
    ).toBeNull();
    expect(parsePodcastClassroomTrack(null)).toBeNull();
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

  it('clamps and floors out-of-range progress percentages', () => {
    const percentOf = (progressPercent: unknown) =>
      parsePodcastEpisode(
        episode({
          videoGeneration: { status: 'processing', progressPercent },
        }),
      ).videoGeneration?.progressPercent;

    expect(percentOf(101)).toBe(100);
    expect(percentOf(-5)).toBe(0);
    // Floor, not round: 99.6 must never claim the video is finished.
    expect(percentOf(42.9)).toBe(42);
    expect(percentOf(99.6)).toBe(99);
  });

  it('ignores non-numeric, NaN, and infinite progress percentages', () => {
    const percentOf = (progressPercent: unknown) =>
      parsePodcastEpisode(
        episode({
          videoGeneration: { status: 'processing', progressPercent },
        }),
      ).videoGeneration?.progressPercent;

    // A numeric string means a broken contract; degrading to the indeterminate
    // spinner is safer than trusting it.
    expect(percentOf('42')).toBeNull();
    expect(percentOf(Number.NaN)).toBeNull();
    expect(percentOf(Number.POSITIVE_INFINITY)).toBeNull();
    expect(percentOf(null)).toBeNull();
  });

  it('keeps a recognised percentage when the stage slug is unknown', () => {
    // A newer server's vocabulary must not cost the user their progress bar, and
    // a raw slug must never reach the UI.
    expect(
      parsePodcastEpisode(
        episode({
          videoGeneration: {
            status: 'processing',
            progressPercent: 55,
            stage: 'transcoding-hdr',
          },
        }),
      ).videoGeneration,
    ).toMatchObject({ progressPercent: 55, stage: null });
  });

  it('keeps the generation summary when progress fields are absent', () => {
    // The back-compat path: rows written before progress existed.
    expect(
      parsePodcastEpisode(
        episode({
          videoGeneration: {
            status: 'processing',
            updatedAt: '2026-07-01T00:05:00.000Z',
          },
        }),
      ).videoGeneration,
    ).toEqual({
      status: 'processing',
      updatedAt: '2026-07-01T00:05:00.000Z',
      progressPercent: null,
      stage: null,
    });
  });

  it('treats missing or malformed video generation summaries as absent', () => {
    expect(parsePodcastEpisode(episode()).videoGeneration).toBeNull();
    expect(
      parsePodcastEpisode(
        episode({
          videoGeneration: {
            status: 'rendering',
            updatedAt: '2026-07-01T00:05:00.000Z',
          },
        }),
      ).videoGeneration,
    ).toBeNull();
    expect(
      parsePodcastEpisode(episode({ videoGeneration: 'processing' }))
        .videoGeneration,
    ).toBeNull();
  });

  it('detects only queued or processing episodes without a completed video as pending', () => {
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: createPodcastVideoGeneration({ status: 'queued' }),
      }),
    ).toBe(true);
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: createPodcastVideoGeneration({ status: 'processing' }),
      }),
    ).toBe(true);
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: createPodcastVideoGeneration({ status: 'completed' }),
      }),
    ).toBe(false);
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: createPodcastVideoGeneration({ status: 'failed' }),
      }),
    ).toBe(false);
    expect(
      isPodcastVideoGenerationPending({
        video: {
          url: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
          durationSeconds: 90,
        },
        videoGeneration: createPodcastVideoGeneration({ status: 'processing' }),
      }),
    ).toBe(false);
    expect(
      isPodcastVideoGenerationPending({
        video: null,
        videoGeneration: null,
      }),
    ).toBe(false);
    expect(isPodcastVideoGenerationPending(null)).toBe(false);
    expect(isPodcastVideoGenerationPending(undefined)).toBe(false);
  });

  it('merges fresh detail video fields into the feed episode', () => {
    const feedEpisode = parsePodcastEpisode(
      episode({
        title: 'Feed title',
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:05:00.000Z',
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        title: 'Detail title',
        script: 'Detail transcript.',
        likeCount: 7,
        languageClassrooms: [
          {
            sourceLanguageCode: 'zh-Hant',
            targetLanguageCode: 'ja',
            oneLiner: 'Detail classroom.',
            keywords: [],
          },
        ],
        video: {
          url: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
          durationSeconds: 90,
        },
        videoGeneration: {
          status: 'completed',
          updatedAt: '2026-07-01T00:10:00.000Z',
        },
      }),
    );

    expect(mergePodcastEpisodeVideo(feedEpisode, null)).toBe(feedEpisode);
    expect(mergePodcastEpisodeVideo(null, detailEpisode)).toBe(detailEpisode);
    expect(mergePodcastEpisodeVideo(null, null)).toBeNull();
    expect(mergePodcastEpisodeVideo(feedEpisode, detailEpisode)).toMatchObject({
      title: 'Feed title',
      script: 'Detail transcript.',
      likeCount: 7,
      languageClassrooms: [
        expect.objectContaining({ oneLiner: 'Detail classroom.' }),
      ],
      video: detailEpisode.video,
      videoGeneration: detailEpisode.videoGeneration,
    });
  });

  it('keeps feed video fields when the detail response has null values', () => {
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: {
          url: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
          durationSeconds: 90,
        },
        videoGeneration: {
          status: 'completed',
          updatedAt: '2026-07-01T00:10:00.000Z',
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({ video: null, videoGeneration: null }),
    );

    expect(mergePodcastEpisodeVideo(feedEpisode, detailEpisode)).toMatchObject({
      video: feedEpisode.video,
      videoGeneration: feedEpisode.videoGeneration,
    });
  });

  it('keeps a newer pending feed generation ahead of stale completed detail data', () => {
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:20:00.000Z',
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        video: {
          url: 'https://cdn.example.com/old-video.mp4',
          thumbnailUrl: 'https://cdn.example.com/old-thumbnail.png',
          durationSeconds: 90,
        },
        videoGeneration: {
          status: 'completed',
          updatedAt: '2026-07-01T00:10:00.000Z',
        },
      }),
    );

    expect(mergePodcastEpisodeVideo(feedEpisode, detailEpisode)).toMatchObject({
      video: null,
      videoGeneration: feedEpisode.videoGeneration,
    });
  });

  it('polls pending generations through initial failures and stops at fresh terminal data', () => {
    const pendingGeneration = createPodcastVideoGeneration({
      status: 'processing',
      updatedAt: '2026-07-01T00:20:00.000Z',
    });
    const staleCompletedEpisode = parsePodcastEpisode(
      episode({
        video: {
          url: 'https://cdn.example.com/old-video.mp4',
          thumbnailUrl: 'https://cdn.example.com/old-thumbnail.png',
          durationSeconds: 90,
        },
        videoGeneration: {
          status: 'completed',
          updatedAt: '2026-07-01T00:10:00.000Z',
        },
      }),
    );
    const freshFailedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'failed',
          updatedAt: '2026-07-01T00:25:00.000Z',
        },
      }),
    );

    expect(podcastVideoRefetchInterval(undefined, pendingGeneration)).toBe(
      20_000,
    );
    expect(
      podcastVideoRefetchInterval(staleCompletedEpisode, pendingGeneration),
    ).toBe(20_000);
    expect(
      podcastVideoRefetchInterval(freshFailedEpisode, pendingGeneration),
    ).toBe(false);
    expect(
      podcastVideoRefetchInterval(freshFailedEpisode, pendingGeneration, 1),
    ).toBe(20_000);
    expect(podcastVideoRefetchInterval(freshFailedEpisode, null)).toBe(false);
  });

  it('polls faster only while a stage is actually in flight', () => {
    const generatingEpisode = (
      videoGeneration: Record<string, unknown>,
    ): ReturnType<typeof parsePodcastEpisode> =>
      parsePodcastEpisode(episode({ video: null, videoGeneration }));

    // A visual stage runs while this localization's own render row is still
    // 'queued', so the cadence keys off `stage`, never off `status`.
    expect(
      podcastVideoRefetchInterval(
        generatingEpisode({
          status: 'queued',
          progressPercent: 22,
          stage: 'selecting-images',
        }),
        null,
      ),
    ).toBe(10_000);
    expect(
      podcastVideoRefetchInterval(
        generatingEpisode({
          status: 'processing',
          progressPercent: 78,
          stage: 'encoding',
        }),
        null,
      ),
    ).toBe(10_000);
    // Nothing claimed yet, or a server with no stage vocabulary: the bar is
    // indeterminate, so there is nothing to poll faster for.
    expect(
      podcastVideoRefetchInterval(
        generatingEpisode({ status: 'queued' }),
        null,
      ),
    ).toBe(20_000);
  });

  it('propagates a progress-only detail update with an unchanged status', () => {
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:05:00.000Z',
          progressPercent: 20,
          stage: 'preparing-media',
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:10:00.000Z',
          progressPercent: 65,
          stage: 'encoding',
        },
      }),
    );

    expect(
      mergePodcastEpisodeVideo(feedEpisode, detailEpisode)?.videoGeneration,
    ).toMatchObject({ progressPercent: 65, stage: 'encoding' });
  });

  it('keeps the newer feed progress when the detail poll is behind', () => {
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:20:00.000Z',
          progressPercent: 80,
          stage: 'encoding',
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:10:00.000Z',
          progressPercent: 30,
          stage: 'preparing-media',
        },
      }),
    );

    expect(
      mergePodcastEpisodeVideo(feedEpisode, detailEpisode)?.videoGeneration,
    ).toMatchObject({ progressPercent: 80, stage: 'encoding' });
  });

  it('prefers the detail generation when both report the same updatedAt', () => {
    // Pins the tie-break, which a backend change could otherwise silently rely on.
    const sameTimestamp = '2026-07-01T00:10:00.000Z';
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: sameTimestamp,
          progressPercent: 80,
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: sameTimestamp,
          progressPercent: 30,
        },
      }),
    );

    expect(
      mergePodcastEpisodeVideo(feedEpisode, detailEpisode)?.videoGeneration
        ?.progressPercent,
    ).toBe(30);
  });

  it('lets progress fall back when a resubmission restarts the pipeline', () => {
    // Re-POSTing the same URL revives the jobs and legitimately resets progress,
    // so freshness must stay timestamp-based rather than "keep the higher percent".
    const feedEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'processing',
          updatedAt: '2026-07-01T00:05:00.000Z',
          progressPercent: 88,
        },
      }),
    );
    const detailEpisode = parsePodcastEpisode(
      episode({
        video: null,
        videoGeneration: {
          status: 'queued',
          updatedAt: '2026-07-01T00:30:00.000Z',
          progressPercent: 2,
        },
      }),
    );

    expect(
      mergePodcastEpisodeVideo(feedEpisode, detailEpisode)?.videoGeneration
        ?.progressPercent,
    ).toBe(2);
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
