import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({ recordPipelineRun: vi.fn() }));

// Only the write is stubbed. stageRunsFromCostLines stays real so the mapping
// from raw cost lines to ledger rows is exercised by the ingest path itself.
vi.mock('./ops-ledger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ops-ledger.js')>()),
  recordPipelineRun: ledger.recordPipelineRun,
}));

import {
  episodeListResponse,
  listRow,
  localizationRow,
} from '../__fixtures__/index-test.js';
import type { EpisodeLocalizationRow } from '../types.js';
import { buildUsageCostDetails, type UsageCostLine } from './cost.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import type { IngestCostSinkEntry } from './ingest.js';
import type { LlmAttemptRecord } from './llm.js';
import type { PipelineRunInput } from './ops-ledger.js';
import { performMultilingualIngestAndEnqueueVideo } from './post-ingest.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoVisualJobRow,
  hashEpisodeVideoVisualSource,
} from './video-jobs.js';

beforeEach(() => {
  ledger.recordPipelineRun.mockReset();
  ledger.recordPipelineRun.mockResolvedValue(undefined);
});

function recordedRun(): PipelineRunInput {
  return ledger.recordPipelineRun.mock.calls[0]![0] as PipelineRunInput;
}

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
  it('enqueues one shared visual and only the canonical zh-Hant video after multilingual audio completes', async () => {
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
        trigger: 'http',
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
      expect.any(Array),
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
    expect(enqueueVideo.mock.calls).toEqual(
      localizations.map((localization) => [localization.id, '123']),
    );
    expect(result.videoJobs).toHaveLength(3);
    expect(result.videoJob?.episode_localization_id).toBe(localizations[0]!.id);
    expect(result.visualJob?.status).toBe('queued');
    expect(result.videoEnqueueError).toBeNull();
    expect(result.runId).toMatch(/^[0-9a-f-]{8}$/);
    expect(result.previousErrors).toEqual({
      visual: null,
      videosByLocalizationId: Object.fromEntries(
        localizations.map((localization) => [localization.id, null]),
      ),
    });
    expect(log.mock.calls.map(([message]) => String(message))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[\/ingest\] run:start run=[^ ]+ /),
        expect.stringMatching(
          /^\[\/ingest\] video:enqueue:start run=[^ ]+ episodeId=/,
        ),
        expect.stringMatching(
          /^\[\/ingest\] video:enqueue:done run=[^ ]+ elapsedMs=\d+ episodeId=.* status=queued,queued,queued$/,
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
        trigger: 'http',
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
        trigger: 'http',
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
        trigger: 'http',
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

  it('normalizes non-Error enqueue failures without failing the completed audio ingest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        trigger: 'http',
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
          enqueueVisual: vi.fn().mockRejectedValue('supabase unavailable'),
          enqueueVideo: vi.fn(),
          findVisualJob: vi.fn().mockResolvedValue(null),
          findVideoJob: vi.fn().mockResolvedValue(null),
        },
      },
    );

    expect(result.videoEnqueueError).toBeInstanceOf(Error);
    expect(result.videoEnqueueError?.message).toBe('supabase unavailable');
    expect(result.ingest.statusCode).toBe(201);
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
        trigger: 'http',
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
        trigger: 'http',
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
        trigger: 'http',
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
    expect(enqueueVideo.mock.calls).toEqual(
      localizations.map((localization) => [localization.id, null]),
    );
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
        trigger: 'http',
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

describe('performMultilingualIngestAndEnqueueVideo cost ledger', () => {
  function scriptLine(overrides: Partial<UsageCostLine> = {}): UsageCostLine {
    return {
      category: 'llm',
      label: 'LLM script',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      costUsd: 0.02,
      ...overrides,
    };
  }

  function scriptAttempt(
    overrides: Partial<LlmAttemptRecord> = {},
  ): LlmAttemptRecord {
    return {
      operation: 'generateScript',
      attempt: 1,
      model: 'anthropic/claude-sonnet-4',
      provider: 'openrouter',
      status: 'completed',
      startedAt: new Date('2026-08-28T09:20:00.000Z'),
      finishedAt: new Date('2026-08-28T09:22:00.000Z'),
      elapsedMs: 120_000,
      timeoutMs: 600_000,
      inputChars: 13_000,
      outputChars: 12_000,
      promptTokens: 9_000,
      completionTokens: 8_000,
      generationId: 'gen-1',
      routing: 'throughput',
      errorCategory: null,
      errorMessage: null,
      costUsd: 0.02,
      ...overrides,
    };
  }

  /** Fills the sink the way the real multilingual loop does, language by language. */
  function ingestFillingSink(
    entries: IngestCostSinkEntry[],
    outcome: { throwAfter?: number; failedEntry?: IngestCostSinkEntry } = {},
  ) {
    return vi.fn(
      async (
        _url: string,
        _languageCode: string,
        costSink?: IngestCostSinkEntry[],
      ) => {
        const delivered = entries.slice(
          0,
          outcome.throwAfter ?? entries.length,
        );
        costSink?.push(...delivered);
        if (outcome.throwAfter !== undefined) {
          // The real loop pushes the dying language's own entry before it
          // rethrows; without that the ledger loses the attempt that failed.
          if (outcome.failedEntry) costSink?.push(outcome.failedEntry);
          throw new Error('en localization failed');
        }
        return {
          episode: episodeListResponse(listRow({ language_code: 'ja' })),
          statusCode: 201 as const,
          costUsd: 0,
          costDetails: buildUsageCostDetails([]),
        };
      },
    );
  }

  const sinkEntries: IngestCostSinkEntry[] = [
    {
      languageCode: 'zh-Hant',
      episodeId: 'episode-1',
      localizationId: 'localization-zh',
      status: 'completed',
      attempts: [scriptAttempt()],
      lines: [
        scriptLine(),
        scriptLine({
          category: 'tts',
          label: 'TTS main audio',
          provider: 'fish-audio',
          model: 'speech-1.6',
          costUsd: 0.05,
          usage: { unit: 'character', quantity: 3_000, unitPriceUsd: 0.000015 },
        }),
      ],
    },
    {
      languageCode: 'ja',
      episodeId: 'episode-1',
      localizationId: 'localization-ja',
      status: 'completed',
      attempts: [],
      lines: [
        scriptLine({
          category: 'translate',
          label: 'OpenRouter translation',
          costUsd: 0.004,
        }),
      ],
    },
  ];

  it('records one run per ingest with a stage row for every language', async () => {
    const localizations = videoLocalizations();

    await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        trigger: 'telegram',
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: ingestFillingSink(sinkEntries),
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

    const run = recordedRun();
    expect(ledger.recordPipelineRun).toHaveBeenCalledTimes(1);
    expect(run).toMatchObject({
      pipeline: 'ingest',
      trigger: 'telegram',
      status: 'completed',
      component: 'ingest',
    });
    expect(run.finishedAt.getTime()).toBeGreaterThanOrEqual(
      run.startedAt.getTime(),
    );
    expect(
      run.stages.map(({ stage, languageCode, localizationId }) => ({
        stage,
        languageCode,
        localizationId,
      })),
    ).toEqual([
      {
        stage: 'narration',
        languageCode: 'zh-Hant',
        localizationId: 'localization-zh',
      },
      {
        stage: 'script',
        languageCode: 'zh-Hant',
        localizationId: 'localization-zh',
      },
      {
        stage: 'translation',
        languageCode: 'ja',
        localizationId: 'localization-ja',
      },
    ]);
    // The script row is written from the attempt, never from the cost line, so
    // the same spend cannot be counted twice.
    expect(run.stages.filter(({ stage }) => stage === 'script')).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: 'completed',
        elapsedMs: 120_000,
        reportedCostUsd: 0.02,
        usage: expect.objectContaining({
          timeoutMs: 600_000,
          routing: 'throughput',
          generationId: 'gen-1',
        }),
      }),
    ]);
  });

  it('still records what the finished languages spent when a later one fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      performMultilingualIngestAndEnqueueVideo(
        'https://example.com/article',
        'ja',
        {
          trigger: 'http',
          dependencies: {
            coordinator: createHeavyWorkCoordinator(),
            findEpisode: vi.fn().mockResolvedValue(null),
            performIngest: ingestFillingSink(sinkEntries, { throwAfter: 1 }),
          },
        },
      ),
    ).rejects.toThrow('en localization failed');

    const run = recordedRun();
    expect(run.status).toBe('failed');
    expect(run.episodeId).toBe('episode-1');
    expect(run.stages.map(({ stage }) => stage)).toEqual([
      'narration',
      'script',
    ]);
    expect(run.stages.map(({ reportedCostUsd }) => reportedCostUsd)).toEqual([
      0.05, 0.02,
    ]);
  });

  it('records the timed-out attempt of the language that took the run down', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      performMultilingualIngestAndEnqueueVideo(
        'https://example.com/article',
        'ja',
        {
          trigger: 'telegram',
          dependencies: {
            coordinator: createHeavyWorkCoordinator(),
            findEpisode: vi.fn().mockResolvedValue(null),
            performIngest: ingestFillingSink([], {
              throwAfter: 0,
              failedEntry: {
                languageCode: 'zh-Hant',
                episodeId: 'episode-1',
                localizationId: 'localization-zh',
                status: 'failed',
                lines: [],
                attempts: [
                  scriptAttempt({
                    status: 'failed',
                    provider: null,
                    outputChars: null,
                    promptTokens: null,
                    completionTokens: null,
                    generationId: null,
                    costUsd: null,
                    errorCategory: 'timeout',
                    errorMessage: 'OpenRouter request timed out after 600000ms',
                  }),
                ],
              },
            }),
          },
        },
      ),
    ).rejects.toThrow('en localization failed');

    const run = recordedRun();
    // Without the failed entry this run row had no episode to point at, which
    // is precisely when someone is looking for it.
    expect(run.episodeId).toBe('episode-1');
    expect(run.stages).toEqual([
      expect.objectContaining({
        stage: 'script',
        status: 'failed',
        attempt: 1,
        provider: 'unknown',
        elapsedMs: 120_000,
        usage: expect.objectContaining({
          errorCategory: 'timeout',
          errorMessage: 'OpenRouter request timed out after 600000ms',
        }),
      }),
    ]);
    // A failed attempt reports no cost at all rather than a zero that would
    // read as a free success.
    expect(run.stages[0]?.reportedCostUsd).toBeUndefined();
  });

  it('records a run with no stages when a resubmission costs nothing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const localizations = videoLocalizations();

    await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        trigger: 'http',
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi
            .fn()
            .mockResolvedValue({ id: localizations[0]!.episode_id }),
          performIngest: ingestFillingSink([
            {
              languageCode: 'zh-Hant',
              episodeId: 'episode-1',
              localizationId: 'localization-zh',
              status: 'completed',
              attempts: [],
              lines: [],
            },
          ]),
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

    expect(recordedRun()).toMatchObject({ status: 'completed', stages: [] });
  });
});
