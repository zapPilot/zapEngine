import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: sentryMocks.capture,
}));

import type {
  EpisodeVideoJobRow,
  EpisodeVideoSource,
  EpisodeVideoVisualJobRow,
  EpisodeVideoVisualSource,
  VideoJobRepository,
  VisualJobRepository,
} from './video-jobs.js';
import { createVideoWorker } from './video-worker.js';

const source = {
  episodeId: 'episode-1',
  localizationId: 'localization-1',
  languageCode: 'zh-Hant',
  title: 'Episode',
  script: 'Canonical script',
  hlsUrl: 'https://cdn.example.com/audio.m3u8',
  sourceUrl: 'https://example.com/article',
  sourceTitle: 'Article',
  canonicalLocalizationId: 'localization-1',
  canonicalScript: 'Canonical script',
  visualManifest: { schemaVersion: 'image-slideshow-v1' },
  visualHash: 'visual-hash',
  visualVersion: 'visual-v1',
  visualR2Prefix: 'episodes/episode-1/visuals/visual-v1/visual-hash',
} as EpisodeVideoSource;

const visualSource = {
  episodeId: 'episode-1',
  canonicalLocalizationId: 'localization-1',
  title: 'Episode',
  script: 'Canonical script',
  englishTitle: 'English episode',
  englishScript: 'English script',
  hlsUrl: 'https://cdn.example.com/audio.m3u8',
  sourceUrl: 'https://example.com/article',
  sourceTitle: 'Article',
} as EpisodeVideoVisualSource;

const renderJob = {
  episode_localization_id: 'localization-1',
  episode_id: 'episode-1',
  attempt_count: 2,
  telegram_chat_id: null,
} as EpisodeVideoJobRow;
const visualJobRow = {
  episode_id: 'episode-1',
  attempt_count: 2,
  telegram_chat_id: null,
} as EpisodeVideoVisualJobRow;

function makeRepository(
  claimed: EpisodeVideoJobRow | null,
): VideoJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(claimed),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    saveManifest: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(null),
    loadSource: vi.fn().mockResolvedValue(source),
    reapFailedNotifications: vi.fn().mockResolvedValue([]),
    markFailureNotified: vi.fn().mockResolvedValue(true),
  };
}

function makeVisualRepository(
  claimed: EpisodeVideoVisualJobRow | null,
): VisualJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(claimed),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    saveCheckpoint: vi.fn().mockResolvedValue(true),
    recordFailureDiagnostics: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue(claimed),
    loadSource: vi.fn().mockResolvedValue(visualSource),
  };
}

const logger = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('video worker failure reporting', () => {
  it.each([
    ['failed', 'error'],
    ['queued', 'warning'],
  ])(
    'reports a render job that landed in %s at level %s',
    async (status, level) => {
      const repository = makeRepository(renderJob);
      repository.fail = vi.fn().mockResolvedValue({ status });
      const error = new Error('ffmpeg died');
      const worker = createVideoWorker({
        repository,
        visualRepository: makeVisualRepository(null),
        processJob: vi.fn().mockRejectedValue(error),
        processVisualJob: vi.fn(),
        logger,
        leaseOwner: 'worker-1',
      });

      await expect(worker.runOnce()).resolves.toBe('failed');

      expect(sentryMocks.capture).toHaveBeenCalledWith(error, {
        component: 'video-render',
        tags: { job_status: status },
        context: {
          runId: expect.stringMatching(/^[a-f0-9]{8}$/),
          episodeLocalizationId: 'localization-1',
          attemptCount: 2,
        },
        level,
      });

      await worker.stop();
    },
  );

  it.each([
    ['failed', 'error'],
    ['queued', 'warning'],
  ])(
    'reports a visual job that landed in %s at level %s',
    async (status, level) => {
      const visualRepository = makeVisualRepository(visualJobRow);
      visualRepository.fail = vi.fn().mockResolvedValue({ status });
      const error = new Error('image search collapsed');
      const worker = createVideoWorker({
        repository: makeRepository(null),
        visualRepository,
        processJob: vi.fn(),
        processVisualJob: vi.fn().mockRejectedValue(error),
        logger,
        leaseOwner: 'worker-1',
      });

      await expect(worker.runOnce()).resolves.toBe('failed');

      expect(sentryMocks.capture).toHaveBeenCalledWith(error, {
        component: 'video-visual',
        tags: { job_status: status },
        context: {
          runId: expect.stringMatching(/^[a-f0-9]{8}$/),
          episodeId: 'episode-1',
          attemptCount: 2,
        },
        level,
      });

      await worker.stop();
    },
  );

  it('does not report an empty queue', async () => {
    const worker = createVideoWorker({
      repository: makeRepository(null),
      visualRepository: makeVisualRepository(null),
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(sentryMocks.capture).not.toHaveBeenCalled();

    await worker.stop();
  });

  it('reports only the first poll failure of a consecutive run', async () => {
    // A throwing poll never reaches onPollResult, so the idle tracker never sees
    // 'empty' and the render machine never exits — the failure this catches is
    // a dedicated CPU burning indefinitely. At a 15s interval, reporting every
    // one of them would be hundreds of events an hour.
    vi.useFakeTimers();
    const visualRepository = makeVisualRepository(null);
    visualRepository.claim = vi
      .fn()
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce(null)
      .mockRejectedValue(new Error('queue unavailable again'));
    const worker = createVideoWorker({
      repository: makeRepository(null),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
      pollIntervalMs: 15_000,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(sentryMocks.capture).toHaveBeenCalledTimes(1);
    expect(sentryMocks.capture).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'queue unavailable' }),
      { component: 'video-worker', tags: { phase: 'poll' } },
    );

    // A successful poll resets the run, so the next outage is reported again.
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(sentryMocks.capture).toHaveBeenCalledTimes(2);
    expect(sentryMocks.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'queue unavailable again' }),
      { component: 'video-worker', tags: { phase: 'poll' } },
    );

    await worker.stop();
  });
});
