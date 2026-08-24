import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  findEpisodeById: vi.fn(),
  findEpisodeLocalizationByEpisodeId: vi.fn(),
  listEpisodeVideoSummariesByLocalizationIds: vi.fn(),
}));

vi.mock('../services/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/db.js')>()),
  findEpisodeById: dbMocks.findEpisodeById,
  findEpisodeLocalizationByEpisodeId:
    dbMocks.findEpisodeLocalizationByEpisodeId,
  listEpisodeVideoSummariesByLocalizationIds:
    dbMocks.listEpisodeVideoSummariesByLocalizationIds,
}));

import {
  packagePodcastScript,
  PODCAST_INTRO,
  ZAP_PILOT_OUTRO,
} from '../services/podcast-packaging.js';
import {
  buildSocialEpisode,
  getSocialEpisode,
  parseSocialEpisodeId,
} from './episode.js';

const EPISODE_ID = '550e8400-e29b-41d4-a716-446655440000';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  dbMocks.findEpisodeById.mockResolvedValue(null);
  dbMocks.findEpisodeLocalizationByEpisodeId.mockResolvedValue(null);
  dbMocks.listEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
    new Map(),
  );
});

describe('parseSocialEpisodeId', () => {
  it('accepts a bare episode UUID', () => {
    expect(parseSocialEpisodeId(`  ${EPISODE_ID}  `)).toBe(EPISODE_ID);
  });

  it('canonicalizes UUID case for stable publish-state keys', () => {
    expect(parseSocialEpisodeId(EPISODE_ID.toUpperCase())).toBe(EPISODE_ID);
  });

  it('extracts the UUID from an episode share URL', () => {
    expect(
      parseSocialEpisodeId(
        `https://from-fed-to-chain-api.fly.dev/e/${EPISODE_ID}?lang=zh-Hant`,
      ),
    ).toBe(EPISODE_ID);
  });

  it('rejects well-formed URLs without an episode path', () => {
    expect(() =>
      parseSocialEpisodeId('https://from-fed-to-chain-api.fly.dev/episodes'),
    ).toThrow('Expected a bare UUID or a share URL with an /e/<uuid> path');
  });

  it('rejects inputs that are neither accepted form', () => {
    expect(() => parseSocialEpisodeId('not-an-episode')).toThrow(
      'Expected a bare UUID or a share URL with an /e/<uuid> path',
    );
  });
});

describe('buildSocialEpisode', () => {
  const episode = {
    id: EPISODE_ID,
    source_url: 'https://example.com/article',
    source_title: 'Source title',
    created_at: '2026-08-11T00:00:00.000Z',
  };
  const localization = {
    id: 'localization-1',
    episode_id: 'episode-1',
    language_code: 'zh-Hant',
    title: '真正的標題',
    raw_text: '來源文章內容',
    script: '完整 podcast 講稿',
    status: 'completed',
  };

  it('maps a completed canonical episode and video', () => {
    vi.stubEnv('PODCAST_PUBLIC_BASE_URL', 'https://podcast.example/base/');

    const result = buildSocialEpisode({
      episode,
      localization,
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
        durationSeconds: 173,
      },
    });

    expect(result).toMatchObject({
      id: EPISODE_ID,
      title: '真正的標題',
      description: '來源文章內容',
      transcript: '完整 podcast 講稿',
      videoDurationSeconds: 173,
      languageCode: 'zh-Hant',
      videoUrl: 'https://cdn.example/video.mp4',
    });
    expect(result.episodeUrl).toBe(
      `https://podcast.example/base/e/${EPISODE_ID}?lang=zh-Hant`,
    );
  });

  it('fails closed when the zh video is not completed', () => {
    expect(() =>
      buildSocialEpisode({
        episode,
        localization,
        video: null,
      }),
    ).toThrow(`No completed zh-Hant video found for episode ${EPISODE_ID}`);
  });

  it('falls back to transcript summary and source title when optional localization fields are missing', () => {
    const result = buildSocialEpisode({
      episode: { ...episode, source_title: 'Fallback source title' },
      localization: { ...localization, title: ' ', raw_text: null },
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
        durationSeconds: 173,
      },
    });
    expect(result.title).toBe('Fallback source title');
    expect(result.description).toBeUndefined();
    expect(result.summary).toBe('完整 podcast 講稿');
  });

  it('removes application-owned podcast packaging from social text', () => {
    const result = buildSocialEpisode({
      episode,
      localization: {
        ...localization,
        raw_text: null,
        script: packagePodcastScript('真正的節目正文。'),
      },
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
        durationSeconds: 173,
      },
    });

    expect(result.transcript).toBe('真正的節目正文。');
    expect(result.summary).toBe('真正的節目正文。');
    expect(result.transcript).not.toContain(PODCAST_INTRO);
    expect(result.transcript).not.toContain(ZAP_PILOT_OUTRO);
  });

  it('allows an empty source title fallback without inventing a title', () => {
    const result = buildSocialEpisode({
      episode: { ...episode, source_title: null },
      localization: { ...localization, title: ' ', raw_text: null },
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
        durationSeconds: 173,
      },
    });
    expect(result.title).toBe('');
  });

  it('fails when the transcript is null or empty', () => {
    expect(() =>
      buildSocialEpisode({
        episode,
        localization: { ...localization, script: null },
        video: {
          url: 'https://cdn.example/video.mp4',
          thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
          durationSeconds: 173,
        },
      }),
    ).toThrow('has no completed zh-Hant transcript');

    expect(() =>
      buildSocialEpisode({
        episode,
        localization: { ...localization, script: ' ' },
        video: {
          url: 'https://cdn.example/video.mp4',
          thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
          durationSeconds: 173,
        },
      }),
    ).toThrow('has no completed zh-Hant transcript');
  });

  it('bounds long social summaries without truncating the transcript', () => {
    const longText = `摘要 ${'市場 '.repeat(400)}`;
    const result = buildSocialEpisode({
      episode,
      localization: {
        ...localization,
        raw_text: longText,
        script: `完整講稿 ${'內容 '.repeat(300)}`,
      },
      video: {
        url: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
        durationSeconds: 173,
      },
    });

    expect(result.summary).toHaveLength(800);
    expect(result.summary.endsWith('...')).toBe(true);
    expect(result.transcript.length).toBeGreaterThan(800);
  });
});

describe('getSocialEpisode', () => {
  it('fails when the episode does not exist', async () => {
    await expect(getSocialEpisode(EPISODE_ID)).rejects.toThrow(
      `Episode ${EPISODE_ID} not found.`,
    );
    expect(dbMocks.findEpisodeLocalizationByEpisodeId).not.toHaveBeenCalled();
  });

  it('fails when the canonical localization is not completed', async () => {
    dbMocks.findEpisodeById.mockResolvedValue({
      id: EPISODE_ID,
      source_url: 'https://example.com/article',
      source_title: 'Source title',
      created_at: '2026-08-11T00:00:00.000Z',
      listened: false,
    });
    dbMocks.findEpisodeLocalizationByEpisodeId.mockResolvedValue({
      id: 'localization-1',
      episode_id: EPISODE_ID,
      language_code: 'zh-Hant',
      title: '真正的標題',
      raw_text: '來源文章內容',
      script: '完整 podcast 講稿',
      status: 'audio_generated',
    });

    await expect(getSocialEpisode(EPISODE_ID)).rejects.toThrow(
      `No completed zh-Hant localization found for episode ${EPISODE_ID}`,
    );
    expect(
      dbMocks.listEpisodeVideoSummariesByLocalizationIds,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when a completed localization has no completed video summary', async () => {
    const localizationId = '996ff642-9a48-4b73-a1e2-a61f40668960';
    dbMocks.findEpisodeById.mockResolvedValue({
      id: EPISODE_ID,
      source_url: 'https://example.com/article',
      source_title: 'Source title',
      created_at: '2026-08-11T00:00:00.000Z',
      listened: false,
    });
    dbMocks.findEpisodeLocalizationByEpisodeId.mockResolvedValue({
      id: localizationId,
      episode_id: EPISODE_ID,
      language_code: 'zh-Hant',
      title: '真正的標題',
      raw_text: '來源文章內容',
      script: '完整 podcast 講稿',
      status: 'completed',
    });

    await expect(getSocialEpisode(EPISODE_ID)).rejects.toThrow(
      `No completed zh-Hant video found for episode ${EPISODE_ID}`,
    );
  });

  it('composes the existing DB helpers into the social episode', async () => {
    const localizationId = '996ff642-9a48-4b73-a1e2-a61f40668960';
    dbMocks.findEpisodeById.mockResolvedValue({
      id: EPISODE_ID,
      source_url: 'https://example.com/article',
      source_title: 'Source title',
      created_at: '2026-08-11T00:00:00.000Z',
      listened: false,
    });
    dbMocks.findEpisodeLocalizationByEpisodeId.mockResolvedValue({
      id: localizationId,
      episode_id: EPISODE_ID,
      language_code: 'zh-Hant',
      title: '真正的標題',
      raw_text: '來源文章內容',
      script: '完整 podcast 講稿',
      status: 'completed',
    });
    dbMocks.listEpisodeVideoSummariesByLocalizationIds.mockResolvedValue(
      new Map([
        [
          localizationId,
          {
            video: {
              url: 'https://cdn.example/video.mp4',
              thumbnailUrl: 'https://cdn.example/thumbnail.jpg',
              durationSeconds: 173,
            },
          },
        ],
      ]),
    );

    const result = await getSocialEpisode(EPISODE_ID);

    expect(dbMocks.findEpisodeById).toHaveBeenCalledWith(EPISODE_ID);
    expect(dbMocks.findEpisodeLocalizationByEpisodeId).toHaveBeenCalledWith(
      EPISODE_ID,
      'zh-Hant',
    );
    expect(
      dbMocks.listEpisodeVideoSummariesByLocalizationIds,
    ).toHaveBeenCalledWith([localizationId]);
    expect(result).toMatchObject({
      id: EPISODE_ID,
      title: '真正的標題',
      videoDurationSeconds: 173,
      languageCode: 'zh-Hant',
      videoUrl: 'https://cdn.example/video.mp4',
    });
  });
});
