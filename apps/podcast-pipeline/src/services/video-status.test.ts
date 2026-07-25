import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localizationRow } from '../__fixtures__/index-test.js';
import type {
  EpisodeVideoJobRow,
  EpisodeVideoVisualJobRow,
} from './video-jobs.js';

const { mockListLocalizations, mockVideoFind, mockVisualFind } = vi.hoisted(
  () => ({
    mockListLocalizations: vi.fn(),
    mockVideoFind: vi.fn(),
    mockVisualFind: vi.fn(),
  }),
);

vi.mock('./db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./db.js')>()),
  listEpisodeLocalizationsByEpisodeId: mockListLocalizations,
}));

vi.mock('./video-jobs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./video-jobs.js')>()),
  getVideoJobRepository: () => ({ find: mockVideoFind }),
  getVideoVisualJobRepository: () => ({ find: mockVisualFind }),
}));

const {
  buildEpisodeVideoGenerationFromEnqueue,
  buildEpisodeVideoGenerationResponse,
  completedVideoResponse,
  loadEpisodeVideoGeneration,
} = await import('./video-status.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildEpisodeVideoGenerationFromEnqueue', () => {
  it('returns a discoverable queued status for all three languages', () => {
    const episodeId = '00000000-0000-4000-8000-000000000001';
    const result = buildEpisodeVideoGenerationFromEnqueue({
      episodeId,
      visualJob: visualJob({ status: 'queued' }),
      videoJobs: [
        videoJob({ episode_localization_id: 'localization-zh' }),
        videoJob({ episode_localization_id: 'localization-ja' }),
        videoJob({ episode_localization_id: 'localization-en' }),
      ],
    });

    expect(result).toMatchObject({
      episodeId,
      status: 'queued',
      statusEndpoint: `/episodes/${episodeId}/videos`,
      error: null,
      visual: { status: 'queued' },
      items: [
        {
          languageCode: 'zh-Hant',
          localizationId: 'localization-zh',
          status: 'queued',
          url: null,
          episodeEndpoint: '/episodes/localization-zh',
        },
        {
          languageCode: 'ja',
          localizationId: 'localization-ja',
          status: 'queued',
        },
        {
          languageCode: 'en',
          localizationId: 'localization-en',
          status: 'queued',
        },
      ],
    });
  });

  it('returns unavailable with the enqueue error when scheduling failed', () => {
    const result = buildEpisodeVideoGenerationFromEnqueue({
      episodeId: 'episode-1',
      visualJob: null,
      videoJobs: [],
      error: new Error('video enqueue failed'),
    });

    expect(result.status).toBe('unavailable');
    expect(result.error).toBe('video enqueue failed');
    expect(result.items).toEqual([]);
  });
});

describe('buildEpisodeVideoGenerationResponse', () => {
  it('exposes completed URLs only when every video artifact is valid', () => {
    const completed = videoJob({
      status: 'completed',
      mp4_url: 'https://cdn.example.com/video.mp4',
      thumbnail_url: 'https://cdn.example.com/thumbnail.png',
      duration_seconds: 91,
    });
    const result = buildEpisodeVideoGenerationResponse({
      episodeId: 'episode-1',
      visualJob: visualJob({ status: 'completed' }),
      jobs: [
        {
          languageCode: 'zh-Hant',
          localizationId: completed.episode_localization_id,
          job: completed,
        },
      ],
    });

    expect(result.status).toBe('completed');
    expect(result.items[0]).toMatchObject({
      status: 'completed',
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      durationSeconds: 91,
    });
  });

  it('reports a failed language job and its last error', () => {
    const result = buildEpisodeVideoGenerationResponse({
      episodeId: 'episode-1',
      visualJob: visualJob({ status: 'completed' }),
      jobs: [
        {
          languageCode: 'ja',
          localizationId: 'localization-ja',
          job: videoJob({
            episode_localization_id: 'localization-ja',
            status: 'failed',
            last_error: 'ffmpeg failed',
          }),
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.items[0]).toMatchObject({
      languageCode: 'ja',
      status: 'failed',
      lastError: 'ffmpeg failed',
      url: null,
    });
  });

  it('reports processing while a visual or language job is active', () => {
    const result = buildEpisodeVideoGenerationResponse({
      episodeId: 'episode-1',
      visualJob: visualJob({ status: 'processing' }),
      jobs: [
        {
          languageCode: 'en',
          localizationId: 'localization-en',
          job: videoJob({ episode_localization_id: 'localization-en' }),
        },
      ],
    });

    expect(result.status).toBe('processing');
  });
});

describe('completedVideoResponse', () => {
  it('rejects queued and incomplete completed rows', () => {
    expect(completedVideoResponse(videoJob())).toBeNull();
    expect(
      completedVideoResponse(
        videoJob({
          status: 'completed',
          mp4_url: '',
          thumbnail_url: 'https://cdn.example.com/thumbnail.png',
          duration_seconds: 90,
        }),
      ),
    ).toBeNull();
    expect(
      completedVideoResponse(
        videoJob({
          status: 'completed',
          mp4_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumbnail.png',
          duration_seconds: 0,
        }),
      ),
    ).toBeNull();
  });
});

describe('loadEpisodeVideoGeneration', () => {
  it('returns null before querying jobs when the episode is missing', async () => {
    mockListLocalizations.mockResolvedValue([]);

    await expect(loadEpisodeVideoGeneration('episode-1')).resolves.toBeNull();
    expect(mockVisualFind).not.toHaveBeenCalled();
    expect(mockVideoFind).not.toHaveBeenCalled();
  });

  it('loads visual and localization jobs in canonical language order', async () => {
    const localizations = [
      localizationRow({ id: 'localization-en', language_code: 'en' }),
      localizationRow({ id: 'localization-zh', language_code: 'zh-Hant' }),
      localizationRow({ id: 'localization-ja', language_code: 'ja' }),
    ];
    mockListLocalizations.mockResolvedValue(localizations);
    mockVisualFind.mockResolvedValue(visualJob({ status: 'completed' }));
    mockVideoFind.mockImplementation((localizationId: string) =>
      Promise.resolve(
        videoJob({
          episode_localization_id: localizationId,
          status: localizationId === 'localization-zh' ? 'completed' : 'queued',
          mp4_url:
            localizationId === 'localization-zh'
              ? 'https://cdn.example.com/zh.mp4'
              : null,
          thumbnail_url:
            localizationId === 'localization-zh'
              ? 'https://cdn.example.com/zh.png'
              : null,
          duration_seconds: localizationId === 'localization-zh' ? 90 : null,
        }),
      ),
    );

    const result = await loadEpisodeVideoGeneration('episode-1');

    expect(mockListLocalizations).toHaveBeenCalledWith('episode-1', [
      'zh-Hant',
      'ja',
      'en',
    ]);
    expect(mockVideoFind.mock.calls.map(([id]) => id)).toEqual([
      'localization-zh',
      'localization-ja',
      'localization-en',
    ]);
    expect(result?.items.map((item) => item.languageCode)).toEqual([
      'zh-Hant',
      'ja',
      'en',
    ]);
    expect(result?.items[0]?.url).toBe('https://cdn.example.com/zh.mp4');
    expect(result?.status).toBe('queued');
  });
});

function videoJob(
  overrides: Partial<EpisodeVideoJobRow> = {},
): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    episode_id: 'episode-1',
    status: 'queued',
    visual_hash: null,
    visual_version: 'visual-v1',
    manifest: null,
    manifest_hash: null,
    renderer_version: null,
    storyboard_provider: null,
    storyboard_model: null,
    storyboard_prompt_version: null,
    script_hash: null,
    mp4_url: null,
    thumbnail_url: null,
    manifest_url: null,
    captions_ass_url: null,
    r2_prefix: null,
    duration_seconds: null,
    telegram_chat_id: null,
    attempt_count: 0,
    next_attempt_at: '2026-07-24T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    failure_notified_at: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-24T00:00:00.000Z',
    updated_at: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function visualJob(
  overrides: Partial<EpisodeVideoVisualJobRow> = {},
): EpisodeVideoVisualJobRow {
  return {
    episode_id: 'episode-1',
    status: 'queued',
    visual_payload: null,
    visual_hash: null,
    visual_version: 'visual-v1',
    source_hash: 'source-hash',
    r2_prefix: null,
    telegram_chat_id: null,
    attempt_count: 0,
    next_attempt_at: '2026-07-24T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-24T00:00:00.000Z',
    updated_at: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}
