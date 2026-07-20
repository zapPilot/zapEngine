import { describe, expect, it, vi } from 'vitest';

import {
  episodeListResponse,
  listRow,
  localizationRow,
} from '../__fixtures__/index-test.js';
import { buildUsageCostDetails } from './cost.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import { performMultilingualIngestAndEnqueueVideo } from './post-ingest.js';
import type { EpisodeVideoJobRow } from './video-jobs.js';

function queuedVideoJob(): EpisodeVideoJobRow {
  return {
    episode_localization_id: localizationRow().id,
    status: 'queued',
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

describe('performMultilingualIngestAndEnqueueVideo', () => {
  it('enqueues exactly one canonical video after multilingual audio completes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const performIngest = vi.fn().mockResolvedValue({
      episode: episodeListResponse(listRow({ language_code: 'ja' })),
      statusCode: 201,
      costUsd: 0,
      costDetails: buildUsageCostDetails([]),
    });
    const findCanonicalLocalization = vi.fn().mockResolvedValue(
      localizationRow({
        classroom_hls_url: 'https://cdn.example.com/classroom/playlist.m3u8',
      }),
    );
    const enqueueVideo = vi.fn().mockResolvedValue(queuedVideoJob());

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        telegramChatId: 123,
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          performIngest,
          findCanonicalLocalization,
          enqueueVideo,
        },
      },
    );

    expect(performIngest).toHaveBeenCalledWith(
      'https://example.com/article',
      'ja',
    );
    expect(findCanonicalLocalization).toHaveBeenCalledWith(
      result.ingest.episode.id,
      'zh-Hant',
    );
    expect(enqueueVideo).toHaveBeenCalledWith(localizationRow().id, '123');
    expect(result.videoJob?.status).toBe('queued');
    expect(result.videoEnqueueError).toBeNull();
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

  it('does not enqueue a completed canonical localization missing classroom audio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const enqueueVideo = vi.fn();

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'zh-Hant',
      {
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow()),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          findCanonicalLocalization: vi.fn().mockResolvedValue(
            localizationRow({
              classroom_hls_url: '   ',
              status: 'completed',
            }),
          ),
          enqueueVideo,
        },
      },
    );

    expect(enqueueVideo).not.toHaveBeenCalled();
    expect(result.videoJob).toBeNull();
    expect(result.videoEnqueueError?.message).toContain(
      'must include main and classroom audio',
    );
    expect(result.ingest.statusCode).toBe(201);
  });

  it('reports a video enqueue failure without failing the ingest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const enqueueVideo = vi
      .fn()
      .mockRejectedValue(new Error('supabase rpc unavailable'));

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        telegramChatId: 123,
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          findCanonicalLocalization: vi.fn().mockResolvedValue(
            localizationRow({
              classroom_hls_url:
                'https://cdn.example.com/classroom/playlist.m3u8',
            }),
          ),
          enqueueVideo,
        },
      },
    );

    expect(result.videoJob).toBeNull();
    expect(result.videoEnqueueError?.message).toBe('supabase rpc unavailable');
    expect(result.ingest.statusCode).toBe(201);
  });
});
