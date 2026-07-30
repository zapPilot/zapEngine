import { describe, expect, it, vi } from 'vitest';

import {
  episodeListResponse,
  listRow,
  localizationRow,
} from '../__fixtures__/index-test.js';
import type { EpisodeLocalizationRow } from '../types.js';
import { buildUsageCostDetails } from './cost.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import { performMultilingualIngestAndEnqueueVideo } from './post-ingest.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoVisualJobRow,
  hashEpisodeVideoVisualSource,
} from './video-jobs.js';

function queuedVideoJob(
  localization: EpisodeLocalizationRow = videoLocalizations()[0]!,
): EpisodeVideoJobRow {
  return {
    episode_localization_id: localization.id,
    episode_id: localization.episode_id,
    status: 'queued',
    progress_percent: null,
    progress_stage: null,
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
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
    telegram_chat_id: '123',
    attempt_count: 0,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    failure_notified_at: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
  };
}

function queuedVisualJob(): EpisodeVideoVisualJobRow {
  const localizations = videoLocalizations();
  const canonical = localizations[0]!;
  const english = localizations[2]!;
  return {
    episode_id: canonical.episode_id,
    status: 'queued',
    progress_percent: null,
    progress_stage: null,
    visual_payload: null,
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    source_hash: hashEpisodeVideoVisualSource(
      canonical.script!,
      english.script!,
    ),
    r2_prefix: null,
    telegram_chat_id: '123',
    attempt_count: 0,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
  };
}

function videoLocalizations(): EpisodeLocalizationRow[] {
  const canonical = localizationRow({
    classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
  });
  return [
    canonical,
    localizationRow({
      id: '00000000-0000-4000-8000-000000000003',
      language_code: 'ja',
      title: '日本語',
      script: '日本語の台本',
      classroom_hls_url: null,
    }),
    localizationRow({
      id: '00000000-0000-4000-8000-000000000004',
      language_code: 'en',
      title: 'English',
      script: 'English script',
      classroom_hls_url: null,
    }),
  ];
}

describe('performMultilingualIngestAndEnqueueVideo', () => {
  it('enqueues one shared visual and all three localization videos after audio completes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const performIngest = vi.fn().mockResolvedValue({
      episode: episodeListResponse(listRow({ language_code: 'ja' })),
      statusCode: 201,
      costUsd: 0,
      costDetails: buildUsageCostDetails([]),
    });
    const localizations = videoLocalizations();
    const listLocalizations = vi.fn().mockResolvedValue(localizations);
    const enqueueVisual = vi.fn().mockResolvedValue(queuedVisualJob());
    const enqueueVideo = vi.fn(
      async (localizationId: string): Promise<EpisodeVideoJobRow> => {
        return queuedVideoJob(
          localizations.find(({ id }) => id === localizationId),
        );
      },
    );

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        telegramChatId: 123,
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest,
          listLocalizations,
          enqueueVisual,
          enqueueVideo,
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn().mockResolvedValue(null),
        },
      },
    );

    expect(performIngest).toHaveBeenCalledWith(
      'https://example.com/article',
      'ja',
    );
    expect(listLocalizations).toHaveBeenCalledWith(result.ingest.episode.id, [
      'zh-Hant',
      'ja',
      'en',
    ]);
    expect(enqueueVisual).toHaveBeenCalledWith(result.ingest.episode.id, {
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      sourceHash: hashEpisodeVideoVisualSource(
        localizations[0]!.script!,
        localizations[2]!.script!,
      ),
      telegramChatId: '123',
    });
    expect(enqueueVideo.mock.calls).toEqual([
      [localizations[0]!.id, '123'],
      [localizations[1]!.id, null],
      [localizations[2]!.id, null],
    ]);
    expect(result.videoJobs).toHaveLength(3);
    expect(result.videoJob?.episode_localization_id).toBe(localizations[0]!.id);
    expect(result.visualJob?.status).toBe('queued');
    expect(result.videoEnqueueError).toBeNull();
    expect(result.runId).toMatch(/^[0-9a-f-]{8}$/);
    expect(result.previousErrors).toEqual({
      visual: null,
      videosByLocalizationId: {
        [localizations[0]!.id]: null,
        [localizations[1]!.id]: null,
        [localizations[2]!.id]: null,
      },
    });
    expect(log.mock.calls.map(([message]) => String(message))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[\/ingest\] run:start run=[^ ]+ /),
        expect.stringMatching(
          /^\[\/ingest\] video:enqueue:start run=[^ ]+ episodeId=/,
        ),
        expect.stringMatching(
          /^\[\/ingest\] video:enqueue:done run=[^ ]+ elapsedMs=\d+ episodeId=.* status=queued$/,
        ),
        expect.stringMatching(
          /^\[\/ingest\] run:done run=[^ ]+ elapsedMs=\d+ /,
        ),
      ]),
    );
    log.mockRestore();
  });

  it('does not enqueue jobs when canonical audio is missing classroom audio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const enqueueVisual = vi.fn();
    const enqueueVideo = vi.fn();
    const localizations = videoLocalizations();
    localizations[0] = {
      ...localizations[0]!,
      classroom_hls_url: '   ',
    };

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'zh-Hant',
      {
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow()),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual,
          enqueueVideo,
        },
      },
    );

    expect(enqueueVisual).not.toHaveBeenCalled();
    expect(enqueueVideo).not.toHaveBeenCalled();
    expect(result.videoJob).toBeNull();
    expect(result.videoJobs).toEqual([]);
    expect(result.visualJob).toBeNull();
    expect(result.videoEnqueueError?.message).toContain(
      'Completed zh-Hant localization with eligible audio',
    );
    expect(result.ingest.statusCode).toBe(201);
  });

  it('requires completed main audio for ja and en before enqueueing any jobs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const localizations = videoLocalizations();
    localizations[1] = {
      ...localizations[1]!,
      hls_url: ' ',
    };
    const enqueueVisual = vi.fn();
    const enqueueVideo = vi.fn();

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual,
          enqueueVideo,
        },
      },
    );

    expect(enqueueVisual).not.toHaveBeenCalled();
    expect(enqueueVideo).not.toHaveBeenCalled();
    expect(result.videoEnqueueError?.message).toContain(
      'Completed ja localization with eligible audio',
    );
    expect(result.ingest.statusCode).toBe(201);
  });

  it('reports a visual enqueue failure without failing the ingest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const enqueueVideo = vi.fn();

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        telegramChatId: 123,
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(videoLocalizations()),
          enqueueVisual: vi
            .fn()
            .mockRejectedValue(new Error('supabase rpc unavailable')),
          enqueueVideo,
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn().mockResolvedValue(null),
        },
      },
    );

    expect(enqueueVideo).not.toHaveBeenCalled();
    expect(result.videoJob).toBeNull();
    expect(result.videoJobs).toEqual([]);
    expect(result.visualJob).toBeNull();
    expect(result.videoEnqueueError?.message).toBe('supabase rpc unavailable');
    expect(result.ingest.statusCode).toBe(201);
    expect(result.runId).toMatch(/^[0-9a-f-]{8}$/);
    expect(result.previousErrors).toEqual({
      visual: null,
      videosByLocalizationId: {},
    });
  });

  it('surfaces errors wiped by the self-healing re-enqueue', async () => {
    const localizations = videoLocalizations();
    const canonical = localizations[0]!;
    const priorError = 'Unsupported episode visual version: stale';
    const findVisualJob = vi.fn().mockResolvedValue({
      ...queuedVisualJob(),
      status: 'failed',
      last_error: priorError,
    });
    const findVideoJob = vi.fn(async (localizationId: string) =>
      localizationId === canonical.id
        ? {
            ...queuedVideoJob(canonical),
            status: 'failed' as const,
            last_error: 'render failed',
          }
        : null,
    );

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 200,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual: vi.fn().mockResolvedValue(queuedVisualJob()),
          enqueueVideo: vi.fn(async (localizationId: string) =>
            queuedVideoJob(
              localizations.find(({ id }) => id === localizationId),
            ),
          ),
          findVisualJob,
          findVideoJob,
        },
      },
    );

    expect(findVisualJob).toHaveBeenCalledWith(result.ingest.episode.id);
    expect(result.previousErrors).toEqual({
      visual: priorError,
      videosByLocalizationId: {
        [localizations[0]!.id]: 'render failed',
        [localizations[1]!.id]: null,
        [localizations[2]!.id]: null,
      },
    });
  });

  it('keeps previousError null while a pending error is still on the row', async () => {
    const localizations = videoLocalizations();
    const canonical = localizations[0]!;
    // A queued row mid-backoff keeps its last_error through re-enqueue; the
    // live lastError field reports it, so previousErrors must stay null.
    const pendingVideoJob = {
      ...queuedVideoJob(canonical),
      last_error: 'transient render error',
    };

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 200,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual: vi.fn().mockResolvedValue(queuedVisualJob()),
          enqueueVideo: vi.fn(async (localizationId: string) =>
            localizationId === canonical.id
              ? pendingVideoJob
              : queuedVideoJob(
                  localizations.find(({ id }) => id === localizationId),
                ),
          ),
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn(async (localizationId: string) =>
            localizationId === canonical.id ? pendingVideoJob : null,
          ),
        },
      },
    );

    expect(result.previousErrors.videosByLocalizationId[canonical.id]).toBe(
      null,
    );
  });

  it('bypasses the heavy-work queue when the episode is already fully ingested', async () => {
    const localizations = videoLocalizations();
    const runIngest = vi.fn();
    const enqueueVideo = vi.fn(async (localizationId: string) =>
      queuedVideoJob(localizations.find(({ id }) => id === localizationId)),
    );

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        dependencies: {
          coordinator: { runIngest } as never,
          findEpisode: vi
            .fn()
            .mockResolvedValue({ id: localizations[0]!.episode_id }),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 200,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual: vi.fn().mockResolvedValue(queuedVisualJob()),
          enqueueVideo,
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn().mockResolvedValue(null),
        },
      },
    );

    // A render in flight holds the coordinator for minutes; the progress
    // re-POST must not queue behind it.
    expect(runIngest).not.toHaveBeenCalled();
    expect(enqueueVideo).toHaveBeenCalledTimes(3);
    expect(result.videoEnqueueError).toBeNull();
    expect(result.videoJobs).toHaveLength(3);
  });

  it('waits for the heavy-work queue when any localization still needs work', async () => {
    const localizations = videoLocalizations();
    localizations[1] = { ...localizations[1]!, status: 'scraped' };
    const coordinator = createHeavyWorkCoordinator();
    const runIngest = vi.spyOn(coordinator, 'runIngest');

    await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        dependencies: {
          coordinator,
          findEpisode: vi
            .fn()
            .mockResolvedValue({ id: localizations[0]!.episode_id }),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          listLocalizations: vi.fn().mockResolvedValue(localizations),
          enqueueVisual: vi.fn().mockResolvedValue(queuedVisualJob()),
          enqueueVideo: vi.fn(async (localizationId: string) =>
            queuedVideoJob(
              localizations.find(({ id }) => id === localizationId),
            ),
          ),
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn().mockResolvedValue(null),
        },
      },
    );

    expect(runIngest).toHaveBeenCalledTimes(1);
  });
});
