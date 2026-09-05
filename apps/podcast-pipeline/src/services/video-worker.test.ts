import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({ recordPipelineRun: vi.fn() }));

// Only the write is stubbed. renderStageRun stays real so the worker's own
// pricing of a render is what these tests assert on.
vi.mock('./ops-ledger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ops-ledger.js')>()),
  recordPipelineRun: ledger.recordPipelineRun,
}));

import { createDeferred } from '../__fixtures__/index-test.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import type { EpisodeRenderMetrics, PipelineRunInput } from './ops-ledger.js';
import { RENDER_ADMISSION_MIN_FREE_BYTES } from './render-admission.js';
import { buildTelegramVideoRetryReplyMarkup } from './telegram.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoCompletion,
  type EpisodeVideoJobRow,
  type EpisodeVideoSource,
  type EpisodeVideoVisualCompletion,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  type VideoJobRepository,
  type VisualJobRepository,
} from './video-jobs.js';
import {
  createVideoWorker as createVideoWorkerImplementation,
  type CreateVideoWorkerOptions,
  type ProcessEpisodeVideoJob,
  type ProcessEpisodeVideoVisualJob,
} from './video-worker.js';

const source: EpisodeVideoSource = {
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
};

const visualSource: EpisodeVideoVisualSource = {
  episodeId: 'episode-1',
  canonicalLocalizationId: 'localization-1',
  title: 'Episode',
  script: 'Canonical script',
  englishTitle: 'English episode',
  englishScript: 'English script',
  hlsUrl: 'https://cdn.example.com/audio.m3u8',
  sourceUrl: 'https://example.com/article',
  sourceTitle: 'Article',
};

const completion: EpisodeVideoCompletion = {
  mp4Url: 'https://cdn.example.com/video.mp4',
  thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
  manifestUrl: 'https://cdn.example.com/manifest.json',
  captionsAssUrl: 'https://cdn.example.com/captions.ass',
  r2Prefix: 'episodes/episode-1/video',
  durationSeconds: 90,
};

const renderMetrics: EpisodeRenderMetrics = {
  status: 'completed',
  wallMs: 480_000,
  durationMs: 900_000,
  narrationDownloadMs: 4_200,
  mediaMs: 120_000,
  chunkEncodeMs: 240_000,
  finalEncodeMs: 90_000,
  downscaleMs: 12_000,
  realtimeFactor: 1.875,
  nodeRssMb: 310.4,
  cgroupCurrentMb: 1_204.8,
  cgroupPeakObservedMb: 3_012.1,
};

const visualCompletion: EpisodeVideoVisualCompletion = {
  visualPayload: { schemaVersion: 'image-slideshow-v1' },
  visualHash: 'visual-hash',
  visualVersion: 'visual-v1',
  sourceHash: 'source-hash',
  r2Prefix: 'episodes/episode-1/visuals/visual-v1/visual-hash',
};

function job(overrides: Partial<EpisodeVideoJobRow> = {}): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    episode_id: 'episode-1',
    status: 'processing',
    progress_percent: null,
    progress_stage: null,
    visual_hash: 'visual-hash',
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
    telegram_chat_id: 'first-chat',
    attempt_count: 1,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-07-16T00:10:00.000Z',
    last_error: null,
    failure_notified_at: null,
    started_at: '2026-07-16T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function visualJob(
  overrides: Partial<EpisodeVideoVisualJobRow> = {},
): EpisodeVideoVisualJobRow {
  return {
    episode_id: 'episode-1',
    status: 'processing',
    progress_percent: null,
    progress_stage: null,
    visual_payload: null,
    visual_hash: null,
    visual_version: 'visual-v1',
    source_hash: 'source-hash',
    r2_prefix: null,
    telegram_chat_id: 'first-chat',
    attempt_count: 1,
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-07-16T00:10:00.000Z',
    last_error: null,
    started_at: '2026-07-16T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeRepository(
  claimed: EpisodeVideoJobRow | null = job(),
): VideoJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(claimed),
    renewLease: vi.fn().mockResolvedValue(true),
    reportProgress: vi.fn().mockResolvedValue(true),
    saveManifest: vi.fn().mockResolvedValue(true),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(null),
    find: vi
      .fn()
      .mockResolvedValue(
        claimed ? { ...claimed, telegram_chat_id: 'latest-chat' } : null,
      ),
    loadSource: vi.fn().mockResolvedValue(source),
    reapFailedNotifications: vi.fn().mockResolvedValue([]),
    markFailureNotified: vi.fn().mockResolvedValue(true),
  };
}

function makeVisualRepository(
  claimed: EpisodeVideoVisualJobRow | null = null,
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

type TestVideoWorkerOptions = Omit<
  CreateVideoWorkerOptions,
  'processVisualJob' | 'visualRepository'
> &
  Partial<
    Pick<CreateVideoWorkerOptions, 'processVisualJob' | 'visualRepository'>
  >;

function createVideoWorker(options: TestVideoWorkerOptions) {
  return createVideoWorkerImplementation({
    visualRepository: makeVisualRepository(),
    processVisualJob: vi.fn(),
    ...options,
  });
}

/**
 * Two claimable renders, two deferred processors, and a MemFree reading that
 * clears the admission floor — the setup every concurrency test needs, so a
 * change to how a slot is opened lands in one place.
 */
function startableConcurrentRenders() {
  const repository = makeRepository();
  vi.mocked(repository.claim)
    .mockResolvedValueOnce(job())
    .mockResolvedValueOnce(job({ episode_localization_id: 'localization-2' }))
    .mockResolvedValue(null);
  const renders = [
    createDeferred<EpisodeVideoCompletion>(),
    createDeferred<EpisodeVideoCompletion>(),
  ];
  let started = 0;
  const processJob: ProcessEpisodeVideoJob = vi.fn((_job, _source, context) => {
    context.reportRenderMetrics(renderMetrics);
    return renders[started++]!.promise;
  });
  const worker = createVideoWorker({
    repository,
    processJob,
    notify: vi.fn().mockResolvedValue(undefined),
    cpuCount: 2,
    readFreeMemoryBytes: vi
      .fn()
      .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
    leaseOwner: 'worker-1',
  });

  const fillBothSlots = async (): Promise<
    [Promise<string>, Promise<string>]
  > => {
    const first = worker.runOnce();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));
    const second = worker.runOnce();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(2));
    return [first, second];
  };

  return { repository, renders, processJob, worker, fillBothSlots };
}

describe('createVideoWorker', () => {
  beforeEach(() => {
    vi.useRealTimers();
    ledger.recordPipelineRun.mockReset();
    ledger.recordPipelineRun.mockResolvedValue(undefined);
  });

  it('processes one job, persists provenance, completes, and notifies the latest chat', async () => {
    const repository = makeRepository();
    const notify = vi.fn().mockResolvedValue(undefined);
    const processJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockImplementation(async (_job, _source, context) => {
        expect(context.runId).toMatch(/^[a-f0-9]{8}$/);
        await context.saveManifest({
          manifest: { schemaVersion: 'v1' },
          manifestHash: 'manifest-hash',
          rendererVersion: 'renderer-v1',
          storyboardProvider: 'nvidia',
          storyboardModel: 'model',
          storyboardPromptVersion: 'prompt-v1',
          scriptHash: 'script-hash',
        });
        return completion;
      });
    const worker = createVideoWorker({
      repository,
      processJob,
      notify,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');
    expect(repository.claim).toHaveBeenCalledWith('worker-1');
    expect(repository.saveManifest).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      expect.objectContaining({ manifestHash: 'manifest-hash' }),
    );
    expect(repository.complete).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      completion,
    );
    expect(notify).toHaveBeenCalledWith(
      'latest-chat',
      expect.stringContaining('影片完成'),
    );
  });

  it('claims and completes shared visual work before localization renders', async () => {
    const repository = makeRepository();
    const visualRepository = makeVisualRepository(visualJob());
    const processVisualJob: ProcessEpisodeVideoVisualJob = vi
      .fn()
      .mockImplementation((_job, _source, context) => {
        expect(context.signal.aborted).toBe(false);
        expect(context.runId).toMatch(/^[a-f0-9]{8}$/);
        return Promise.resolve(visualCompletion);
      });
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');
    expect(visualRepository.claim).toHaveBeenCalledWith('worker-1');
    expect(visualRepository.loadSource).toHaveBeenCalledWith('episode-1');
    expect(processVisualJob).toHaveBeenCalledWith(
      expect.objectContaining({ episode_id: 'episode-1' }),
      visualSource,
      expect.objectContaining({ runId: expect.any(String) }),
    );
    expect(visualRepository.complete).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      visualCompletion,
    );
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it('releases a failed visual job without attempting a localization render', async () => {
    const repository = makeRepository();
    const visualRepository = makeVisualRepository(visualJob());
    vi.mocked(visualRepository.fail).mockResolvedValue(
      visualJob({
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi
        .fn()
        .mockRejectedValue(new Error('no qualified images')),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(visualRepository.fail).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      'no qualified images',
    );
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it('flushes only the newest progress report per interval', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoCompletion>((resolve) => {
          // ffmpeg emits roughly two of these per second; only the last one
          // before each flush should reach the database.
          context.reportProgress({ percent: 35, stage: 'encoding' });
          context.reportProgress({ percent: 48, stage: 'encoding' });
          context.reportProgress({ percent: 61, stage: 'encoding' });
          setTimeout(() => resolve(completion), 25_000);
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      progressFlushIntervalMs: 10_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(repository.reportProgress).toHaveBeenCalledTimes(1);
    expect(repository.reportProgress).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      { percent: 61, stage: 'encoding' },
    );

    // Nothing new was reported, so the next tick must not write again.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(repository.reportProgress).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(running).resolves.toBe('completed');
  });

  it('routes visual progress to the visual queue', async () => {
    vi.useFakeTimers();
    const visualRepository = makeVisualRepository(visualJob());
    const processVisualJob: ProcessEpisodeVideoVisualJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoVisualCompletion>((resolve) => {
          context.reportProgress({ percent: 43, stage: 'selecting-images' });
          setTimeout(() => resolve(visualCompletion), 15_000);
        }),
    );
    const worker = createVideoWorker({
      repository: makeRepository(null),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob,
      leaseOwner: 'worker-1',
      progressFlushIntervalMs: 10_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(visualRepository.reportProgress).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      { percent: 43, stage: 'selecting-images' },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await expect(running).resolves.toBe('completed');
  });

  it('completes the render when progress reporting throws and logs that outage only once', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    vi.mocked(repository.reportProgress).mockRejectedValue(
      new Error('progress RPC unavailable'),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoCompletion>((resolve) => {
          context.reportProgress({ percent: 41, stage: 'encoding' });
          setTimeout(
            () => context.reportProgress({ percent: 61, stage: 'encoding' }),
            11_000,
          );
          setTimeout(() => resolve(completion), 25_000);
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      progressFlushIntervalMs: 10_000,
      logger,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    // Progress is cosmetic: a broken progress RPC must never cost a render.
    await expect(running).resolves.toBe('completed');
    expect(repository.fail).not.toHaveBeenCalled();
    expect(repository.reportProgress).toHaveBeenCalledTimes(2);
    expect(
      logger.error.mock.calls.filter(([message]) =>
        String(message).includes('progress reporting unavailable'),
      ),
    ).toHaveLength(1);
  });

  it('does not treat a false progress report as a lost lease', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    // renewLease returning false aborts the job; reportProgress must not, or a
    // row reset between flushes would kill an otherwise healthy render.
    vi.mocked(repository.reportProgress).mockResolvedValue(false);
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoCompletion>((resolve) => {
          context.reportProgress({ percent: 61, stage: 'encoding' });
          setTimeout(() => resolve(completion), 15_000);
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      progressFlushIntervalMs: 10_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(running).resolves.toBe('completed');
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('stops flushing progress once the job settles', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      async (_job, _source, context) => {
        context.reportProgress({ percent: 61, stage: 'encoding' });
        return completion;
      },
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      progressFlushIntervalMs: 10_000,
    });

    await expect(worker.runOnce()).resolves.toBe('completed');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.reportProgress).not.toHaveBeenCalled();
  });

  it('aborts visual processing when its heartbeat loses the episode lease', async () => {
    vi.useFakeTimers();
    const visualRepository = makeVisualRepository(visualJob());
    vi.mocked(visualRepository.renewLease).mockResolvedValue(false);
    vi.mocked(visualRepository.fail).mockResolvedValue(
      visualJob({
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    const processVisualJob: ProcessEpisodeVideoVisualJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoVisualCompletion>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            () => reject(context.signal.reason),
            { once: true },
          );
        }),
    );
    const worker = createVideoWorker({
      repository: makeRepository(),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob,
      leaseOwner: 'worker-1',
      heartbeatIntervalMs: 60_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(running).resolves.toBe('failed');
    expect(visualRepository.renewLease).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
    );
    expect(visualRepository.fail).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      expect.stringContaining('lease lost'),
    );
  });

  it('treats a false visual completion update as a lost lease', async () => {
    const visualRepository = makeVisualRepository(visualJob());
    vi.mocked(visualRepository.complete).mockResolvedValue(false);
    vi.mocked(visualRepository.fail).mockResolvedValue(
      visualJob({
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    const worker = createVideoWorker({
      repository: makeRepository(),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn().mockResolvedValue(visualCompletion),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(visualRepository.fail).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      expect.stringContaining('lease lost'),
    );
  });

  it('does not claim while an ingest is active', async () => {
    const repository = makeRepository();
    const coordinator = createHeavyWorkCoordinator();
    const ingest = createDeferred<void>();
    const started = createDeferred<void>();
    const runningIngest = coordinator.runIngest(() => {
      started.resolve();
      return ingest.promise;
    });
    await started.promise;
    const worker = createVideoWorker({
      repository,
      coordinator,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('heavy-work-busy');
    expect(repository.claim).not.toHaveBeenCalled();
    ingest.resolve();
    await runningIngest;
  });

  it.each<[string, number | null]>([
    ['MemFree cannot be read', null],
    ['free memory is short', RENDER_ADMISSION_MIN_FREE_BYTES - 1],
  ])('keeps concurrency at one when %s', async (_reason, freeBytes) => {
    const repository = makeRepository();
    const render = createDeferred<EpisodeVideoCompletion>();
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 2,
      readFreeMemoryBytes: vi.fn().mockResolvedValue(freeBytes),
      logger,
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('admission:hold'),
    );
    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
  });

  it('runs a second job while the first is still rendering', async () => {
    const { repository, renders, fillBothSlots } = startableConcurrentRenders();

    const [first, second] = await fillBothSlots();
    renders[0]!.resolve(completion);
    renders[1]!.resolve(completion);

    await expect(first).resolves.toBe('completed');
    await expect(second).resolves.toBe('completed');
    expect(repository.claim).toHaveBeenCalledTimes(2);
    // Both renders sampled the machine's memory while sharing it, so neither
    // row may be read as a solo-render data point when resizing the group.
    expect(
      ledger.recordPipelineRun.mock.calls.map(
        (call) =>
          (call[0] as PipelineRunInput).stages[0]?.usage?.['concurrentJobs'],
      ),
    ).toEqual([2, 2]);
  });

  it('refuses a third job once both slots are full', async () => {
    const { repository, renders, fillBothSlots, worker } =
      startableConcurrentRenders();

    const [first, second] = await fillBothSlots();
    await expect(worker.runOnce()).resolves.toBe('busy');
    // A third encode would only queue for a vCPU that does not exist.
    expect(repository.claim).toHaveBeenCalledTimes(2);

    renders[0]!.resolve(completion);
    renders[1]!.resolve(completion);
    await Promise.all([first, second]);
  });

  // The performance-1x render shape. A second job would queue for a core that
  // does not exist while still holding its own ~0.75 GiB, which is what
  // OOM-kills a 2 GB machine.
  it('runs strictly one job at a time on a single-vCPU machine', async () => {
    const repository = makeRepository();
    vi.mocked(repository.claim)
      .mockResolvedValueOnce(job())
      .mockResolvedValue(null);
    const render = createDeferred<EpisodeVideoCompletion>();
    const readFreeMemoryBytes = vi
      .fn()
      .mockResolvedValue(Number.MAX_SAFE_INTEGER);
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) => {
        context.reportRenderMetrics(renderMetrics);
        return render.promise;
      },
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 1,
      readFreeMemoryBytes,
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(repository.claim).toHaveBeenCalledTimes(1);
    // Capacity alone closed the slot, so the guard never paid for a /proc read.
    expect(readFreeMemoryBytes).not.toHaveBeenCalled();

    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
    expect(
      (ledger.recordPipelineRun.mock.calls[0]?.[0] as PipelineRunInput)
        .stages[0]?.usage?.['concurrentJobs'],
    ).toBe(1);
  });

  it('drain() resolves immediately when nothing is in flight', async () => {
    const worker = createVideoWorker({
      repository: makeRepository(null),
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
    });

    await expect(worker.drain()).resolves.toBeUndefined();
    await worker.stop();
  });

  it('drain() stops claiming and waits for the render in flight to finish', async () => {
    const repository = makeRepository();
    vi.mocked(repository.claim)
      .mockResolvedValueOnce(job())
      .mockResolvedValue(null);
    const render = createDeferred<EpisodeVideoCompletion>();
    const aborted = vi.fn();
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) => {
        context.signal.addEventListener('abort', aborted, { once: true });
        return render.promise;
      },
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 2,
      readFreeMemoryBytes: vi
        .fn()
        .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));

    let settled = false;
    const draining = (async () => {
      await worker.drain();
      settled = true;
    })();
    // The second slot is open and memory is fine, but a draining worker must
    // not take on work it would then have to wait for.
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    // Unlike stop(), a drain never abandons the render it is waiting on.
    expect(aborted).not.toHaveBeenCalled();

    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
    await draining;
    expect(settled).toBe(true);
    expect(aborted).not.toHaveBeenCalled();
  });

  // A claim RPC already in flight can still return a job. Resolving the drain
  // on the empty in-flight set would leave that row leased with nobody
  // rendering it.
  it('drain() waits for a claim already in flight, then for the job it returns', async () => {
    const repository = makeRepository();
    const claim = createDeferred<EpisodeVideoJobRow | null>();
    vi.mocked(repository.claim).mockReturnValue(claim.promise);
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.claim).toHaveBeenCalled());

    let settled = false;
    const draining = (async () => {
      await worker.drain();
      settled = true;
    })();
    await Promise.resolve();
    expect(settled).toBe(false);

    claim.resolve(job());
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    expect(settled).toBe(false);

    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
    await draining;
    expect(settled).toBe(true);
  });

  it('aborts every job in flight when the worker stops', async () => {
    const repository = makeRepository();
    vi.mocked(repository.claim)
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ episode_localization_id: 'localization-2' }))
      .mockResolvedValue(null);
    const aborted: string[] = [];
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (claimed, _source, context) =>
        new Promise<EpisodeVideoCompletion>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              aborted.push(claimed.episode_localization_id);
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 2,
      readFreeMemoryBytes: vi
        .fn()
        .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));
    const second = worker.runOnce();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(2));

    await worker.stop();
    // A slot left running past stop() holds its DB lease until Fly SIGKILLs it.
    expect(aborted).toEqual(['localization-1', 'localization-2']);
    await expect(first).resolves.toBe('failed');
    await expect(second).resolves.toBe('failed');
  });

  it('reports busy, never empty, while another job still holds a slot', async () => {
    const repository = makeRepository();
    vi.mocked(repository.claim)
      .mockResolvedValueOnce(job())
      .mockResolvedValue(null);
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 2,
      readFreeMemoryBytes: vi
        .fn()
        .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    // 'empty' is what makes src/worker.ts exit the process, which would kill
    // the render still holding the other slot.
    await expect(worker.runOnce()).resolves.toBe('busy');

    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
    await expect(worker.runOnce()).resolves.toBe('empty');
  });

  it('claims no second visual job while one is already planning', async () => {
    const repository = makeRepository(null);
    const visualRepository = makeVisualRepository(visualJob());
    const planning = createDeferred<EpisodeVideoVisualCompletion>();
    const worker = createVideoWorker({
      repository,
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi.fn().mockReturnValue(planning.promise),
      cpuCount: 2,
      readFreeMemoryBytes: vi
        .fn()
        .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() =>
      expect(visualRepository.claim).toHaveBeenCalledTimes(1),
    );
    // The slot is open, but Brave's image quota is not: the poll falls straight
    // through to the render queue instead.
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(visualRepository.claim).toHaveBeenCalledTimes(1);
    expect(repository.claim).toHaveBeenCalledTimes(1);

    planning.resolve(visualCompletion);
    await expect(first).resolves.toBe('completed');
  });

  it('aborts processing when the heartbeat loses the lease', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    vi.mocked(repository.renewLease).mockResolvedValue(false);
    vi.mocked(repository.fail).mockResolvedValue(
      job({ status: 'queued', lease_owner: null, lease_expires_at: null }),
    );
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoCompletion>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            // The abort reason is the VideoLeaseLostError set by the worker.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            () => reject(context.signal.reason),
            { once: true },
          );
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      heartbeatIntervalMs: 60_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(running).resolves.toBe('failed');
    expect(repository.renewLease).toHaveBeenCalledTimes(1);
    expect(repository.fail).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      expect.stringContaining('lease lost'),
    );
  });

  it('routes terminal failure notifications through the idempotent reap sweep', async () => {
    const repository = makeRepository(job({ attempt_count: 3 }));
    vi.mocked(repository.fail).mockResolvedValue(
      job({
        status: 'failed',
        attempt_count: 3,
        telegram_chat_id: 'last-chat',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    vi.mocked(repository.reapFailedNotifications)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          episodeLocalizationId: 'localization-1',
          telegramChatId: 'last-chat',
          episodeId: 'episode-1',
          languageCode: 'zh-Hant',
          lastError: 'render failed',
        },
      ]);
    const notify = vi.fn().mockResolvedValue(undefined);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockRejectedValue(new Error('render failed')),
      notify,
      leaseOwner: 'worker-1',
    });

    // Failing the job does not notify inline — it only releases the row.
    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(notify).not.toHaveBeenCalled();

    // The next poll's reap sweep delivers the failure notice, then records it
    // only after the send resolves. This also covers crash-recovery and
    // source-never-loaded failures.
    vi.mocked(repository.claim).mockResolvedValueOnce(null);
    await worker.runOnce();
    expect(notify).toHaveBeenCalledWith(
      'last-chat',
      expect.stringContaining('影片失敗，但音頻仍可使用'),
      { replyMarkup: buildTelegramVideoRetryReplyMarkup('episode-1') },
    );
    expect(repository.markFailureNotified).toHaveBeenCalledWith(
      'localization-1',
    );
  });

  it('does not mark a failure notified when the send fails, so it retries', async () => {
    const repository = makeRepository(null);
    vi.mocked(repository.reapFailedNotifications).mockResolvedValue([
      {
        episodeLocalizationId: 'localization-1',
        telegramChatId: 'last-chat',
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        lastError: 'render failed',
      },
    ]);
    const notify = vi.fn().mockRejectedValue(new Error('telegram 503'));
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      notify,
      leaseOwner: 'worker-1',
    });

    await worker.runOnce();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(repository.markFailureNotified).not.toHaveBeenCalled();
  });

  it('retries a transient heartbeat error without aborting the render', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    vi.mocked(repository.renewLease)
      .mockRejectedValueOnce(new Error('transient 503'))
      .mockResolvedValue(true);
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
      heartbeatIntervalMs: 60_000,
      leaseRenewRetryIntervalMs: 5_000,
    });

    const running = worker.runOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(repository.renewLease).toHaveBeenCalledTimes(2);
    render.resolve(completion);
    await expect(running).resolves.toBe('completed');
  });

  it('keeps retrying heartbeat failures with backoff while the lease can still outlast them', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    vi.mocked(repository.renewLease).mockRejectedValue(
      new Error('supabase unreachable'),
    );
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
      heartbeatIntervalMs: 60_000,
      leaseRenewRetryIntervalMs: 5_000,
    });

    const running = worker.runOnce();
    // Four consecutive failures — one more than the retired three-strike rule —
    // spread over 5s, 10s and 20s of backoff.
    await vi.advanceTimersByTimeAsync(60_000 + 5_000 + 10_000 + 20_000);
    expect(repository.renewLease).toHaveBeenCalledTimes(4);

    render.resolve(completion);
    await expect(running).resolves.toBe('completed');
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('aborts the render once continued heartbeat failures would outlive the lease', async () => {
    vi.useFakeTimers();
    const repository = makeRepository();
    vi.mocked(repository.renewLease).mockRejectedValue(
      new Error('supabase unreachable'),
    );
    vi.mocked(repository.fail).mockResolvedValue(
      job({ status: 'queued', lease_owner: null, lease_expires_at: null }),
    );
    const processJob: ProcessEpisodeVideoJob = vi.fn(
      (_job, _source, context) =>
        new Promise<EpisodeVideoCompletion>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => {
              const reason: unknown = context.signal.reason;
              reject(
                reason instanceof Error ? reason : new Error(String(reason)),
              );
            },
            { once: true },
          );
        }),
    );
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
      heartbeatIntervalMs: 60_000,
      leaseRenewRetryIntervalMs: 5_000,
    });

    const running = worker.runOnce();
    // Backoff caps at 60s, so the budget (10min lease minus a 90s margin) is
    // reached on the 11th failure at t=495s — not after 10 seconds.
    await vi.advanceTimersByTimeAsync(600_000);
    await expect(running).resolves.toBe('failed');
    expect(repository.renewLease).toHaveBeenCalledTimes(11);
    expect(repository.fail).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      expect.stringContaining('Video lease heartbeat failed for 495s'),
    );
  });

  it('uses recursive polling and aborts active work on stop', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
      pollIntervalMs: 15_000,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.claim).toHaveBeenCalledTimes(2);

    await worker.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(repository.claim).toHaveBeenCalledTimes(2);
  });

  it('start() is idempotent when called repeatedly', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
      pollIntervalMs: 15_000,
    });

    worker.start();
    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    await worker.stop();
  });

  // job_capacity is the cheapest proof in `fly logs` that a resized machine is
  // running the number of jobs it can actually afford.
  it('start() announces the lease owner, visual version and slot count', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      logger,
      leaseOwner: 'host-1:42:uuid',
      cpuCount: 1,
      pollIntervalMs: 15_000,
    });

    worker.start();
    expect(logger.info).toHaveBeenCalledWith(
      `[video-worker] started lease_owner=host-1:42:uuid visual_version=${EPISODE_VIDEO_VISUAL_VERSION} job_capacity=1 cpus=1`,
    );
    await worker.stop();
  });

  it('start() after stop() does not rearm polling', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
      pollIntervalMs: 15_000,
    });

    worker.start();
    await worker.stop();
    worker.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(repository.claim).not.toHaveBeenCalled();
  });

  it('returns busy while another poll is inside the claim phase', async () => {
    const repository = makeRepository();
    const claim = createDeferred<EpisodeVideoJobRow | null>();
    vi.mocked(repository.claim).mockReturnValue(claim.promise);
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      cpuCount: 2,
      readFreeMemoryBytes: vi
        .fn()
        .mockResolvedValue(RENDER_ADMISSION_MIN_FREE_BYTES),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.claim).toHaveBeenCalled());
    // The claim RPC has not answered yet, so the slot count is still zero: only
    // the claim-phase lock stops a second poll claiming beside it.
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(repository.claim).toHaveBeenCalledTimes(1);

    claim.resolve(job());
    render.resolve(completion);
    await expect(first).resolves.toBe('completed');
  });

  it('handles lease-lost when persistManifest returns false', async () => {
    const repository = makeRepository();
    vi.mocked(repository.saveManifest).mockResolvedValue(false);
    vi.mocked(repository.fail).mockResolvedValue(
      job({ status: 'queued', lease_owner: null, lease_expires_at: null }),
    );
    const processJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockImplementation(async (_job, _source, context) => {
        await context.saveManifest({
          manifest: { schemaVersion: 'v1' },
          manifestHash: 'manifest-hash',
          rendererVersion: 'renderer-v1',
          storyboardProvider: 'nvidia',
          storyboardModel: 'model',
          storyboardPromptVersion: 'prompt-v1',
          scriptHash: 'script-hash',
        });
        return completion;
      });
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(repository.saveManifest).toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      expect.stringContaining('lease lost'),
    );
  });

  it('handles lease-lost when complete() returns false', async () => {
    const repository = makeRepository();
    vi.mocked(repository.complete).mockResolvedValue(false);
    vi.mocked(repository.fail).mockResolvedValue(
      job({ status: 'queued', lease_owner: null, lease_expires_at: null }),
    );
    const processJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockResolvedValue(completion);
    const worker = createVideoWorker({
      repository,
      processJob,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(repository.complete).toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      expect.stringContaining('lease lost'),
    );
  });

  it('skips completion notification when the latest job has no Telegram chat', async () => {
    const repository = makeRepository();
    vi.mocked(repository.find).mockResolvedValue(
      job({ telegram_chat_id: null }),
    );
    const notify = vi.fn();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockResolvedValue(completion),
      notify,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');
    expect(notify).not.toHaveBeenCalled();
  });

  it('continues without notification when latest job lookup throws', async () => {
    const repository = makeRepository();
    vi.mocked(repository.find).mockRejectedValue(
      new Error('find lookup exploded'),
    );
    const errorLogs: { msg: string; details?: unknown }[] = [];
    const logger = {
      info: vi.fn(),
      error: (msg: string, details?: unknown) => {
        errorLogs.push({ msg, details });
      },
    };
    const processJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockImplementation(async (_job, _source, context) => {
        await context.saveManifest({
          manifest: { schemaVersion: 'v1' },
          manifestHash: 'manifest-hash',
          rendererVersion: 'renderer-v1',
          storyboardProvider: 'nvidia',
          storyboardModel: 'model',
          storyboardPromptVersion: 'prompt-v1',
          scriptHash: 'script-hash',
        });
        return completion;
      });
    const worker = createVideoWorker({
      repository,
      processJob,
      notify: vi.fn().mockResolvedValue(undefined),
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');
    expect(
      errorLogs.some((entry) =>
        entry.msg.includes('completed job notification lookup failed'),
      ),
    ).toBe(true);
  });

  it('returns failed and logs unknown status when visualRepository.fail itself throws', async () => {
    const visualRepository = makeVisualRepository(visualJob());
    vi.mocked(visualRepository.fail).mockRejectedValue(
      new Error('visual release rpc down'),
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository: makeRepository(null),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob: vi
        .fn()
        .mockRejectedValue(new Error('visual render exploded')),
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] visual:failed',
      expect.objectContaining({ status: 'unknown' }),
    );
  });

  it('returns failed and logs when repository.fail itself throws', async () => {
    const repository = makeRepository();
    const errorLogs: { msg: string; details?: unknown }[] = [];
    const logger = {
      info: vi.fn(),
      error: (msg: string, details?: unknown) => {
        errorLogs.push({ msg, details });
      },
    };
    vi.mocked(repository.fail).mockRejectedValue(new Error('release rpc down'));
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockRejectedValue(new Error('render exploded')),
      notify: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    expect(
      errorLogs.some((entry) =>
        entry.msg.includes('failed to release video job'),
      ),
    ).toBe(true);
  });

  it('records the reap sweep stamp even when the send only logs a warning', async () => {
    const repository = makeRepository(job({ attempt_count: 3 }));
    vi.mocked(repository.fail).mockResolvedValue(
      job({
        status: 'failed',
        attempt_count: 3,
        telegram_chat_id: 'last-chat',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    vi.mocked(repository.reapFailedNotifications)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          episodeLocalizationId: 'localization-1',
          telegramChatId: 'last-chat',
          episodeId: 'episode-1',
          languageCode: 'zh-Hant',
          lastError: 'render failed',
        },
      ]);
    const errorLogs: { msg: string; details?: unknown }[] = [];
    const logger = {
      info: vi.fn(),
      error: (msg: string, details?: unknown) => {
        errorLogs.push({ msg, details });
      },
    };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockRejectedValue(new Error('render failed')),
      notify: vi.fn().mockResolvedValue(undefined),
      logger,
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');
    vi.mocked(repository.claim).mockResolvedValueOnce(null);
    await worker.runOnce();
    expect(repository.markFailureNotified).toHaveBeenCalledWith(
      'localization-1',
    );
    expect(
      errorLogs.some((entry) =>
        entry.msg.includes('failed to record failure notification'),
      ),
    ).toBe(false);
  });

  it('scheduled poll catches and logs uncaught errors thrown from runOnce', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    vi.mocked(repository.claim).mockReset();
    vi.mocked(repository.claim).mockRejectedValue(new Error('claim blew up'));
    const errorLogs: { msg: string; details?: unknown }[] = [];
    const logger = {
      info: vi.fn(),
      error: (msg: string, details?: unknown) => {
        errorLogs.push({ msg, details });
      },
    };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      notify: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
      pollIntervalMs: 5_000,
    });

    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLogs.some((entry) => entry.msg.includes('poll failed'))).toBe(
      true,
    );
    expect(
      errorLogs.some((entry) => {
        const err = entry.details as Error | undefined;
        return err?.message?.includes('claim blew up');
      }),
    ).toBe(true);
    await worker.stop();
  });

  it('normalizes non-Error reap failures before logging them', async () => {
    const repository = makeRepository(null);
    vi.mocked(repository.reapFailedNotifications).mockRejectedValue(
      'reap string failure',
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      notify: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
    });

    await worker.runOnce();
    expect(logger.error).toHaveBeenCalledWith(
      '[video-worker] failed to reap video failure notifications',
      expect.objectContaining({ message: 'reap string failure' }),
    );
  });

  it('logs when the reapFailedNotifications sweep itself errors', async () => {
    const repository = makeRepository(null);
    vi.mocked(repository.reapFailedNotifications).mockReset();
    vi.mocked(repository.reapFailedNotifications).mockRejectedValue(
      new Error('reap failed'),
    );
    const errorLogs: { msg: string; details?: unknown }[] = [];
    const logger = {
      info: vi.fn(),
      error: (msg: string, details?: unknown) => {
        errorLogs.push({ msg, details });
      },
    };
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      notify: vi.fn(),
      logger,
      leaseOwner: 'worker-1',
    });

    await worker.runOnce();
    expect(
      errorLogs.some((entry) =>
        entry.msg.includes('failed to reap video failure notifications'),
      ),
    ).toBe(true);
  });

  it('returns stop without claiming when shutdown is requested mid-poll', async () => {
    const repository = makeRepository();
    const render = createDeferred<EpisodeVideoCompletion>();
    const abortableJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockImplementation(async (_job, _source, context) => {
        context.signal.addEventListener(
          'abort',
          () => render.reject(context.signal.reason),
          { once: true },
        );
        return render.promise;
      });
    const worker = createVideoWorker({
      repository,
      processJob: abortableJob,
      notify: vi.fn(),
      leaseOwner: 'worker-1',
    });

    const running = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    render.reject(new Error('aborted shutdown'));
    await expect(
      worker.stop(new Error('shutting down')),
    ).resolves.toBeUndefined();
    await running;
  });

  it('aborts a render job claimed after shutdown began mid-claim', async () => {
    const repository = makeRepository();
    const claim = createDeferred<EpisodeVideoJobRow>();
    vi.mocked(repository.claim).mockReturnValue(claim.promise);
    vi.mocked(repository.fail).mockResolvedValue(
      job({ status: 'queued', lease_owner: null, lease_expires_at: null }),
    );
    // Never resolved: if the job controller misses the already-aborted shutdown
    // signal, the render owns the poll forever and stop() cannot return.
    const render = createDeferred<EpisodeVideoCompletion>();
    const processJob: ProcessEpisodeVideoJob = vi
      .fn()
      .mockReturnValue(render.promise);
    const worker = createVideoWorker({
      repository,
      processJob,
      notify: vi.fn(),
      leaseOwner: 'worker-1',
    });

    const running = worker.runOnce();
    await vi.waitFor(() => expect(repository.claim).toHaveBeenCalled());
    // stop() aborts synchronously, so the claim below settles into an
    // already-aborted shutdown signal.
    const stopping = worker.stop(new Error('video worker shutting down'));
    claim.resolve(job());

    await expect(stopping).resolves.toBeUndefined();
    await expect(running).resolves.toBe('failed');
    expect(processJob).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledWith(
      'localization-1',
      'worker-1',
      'video worker shutting down',
    );
  });

  it('aborts a visual job claimed after shutdown began mid-claim', async () => {
    const visualRepository = makeVisualRepository();
    const claim = createDeferred<EpisodeVideoVisualJobRow>();
    vi.mocked(visualRepository.claim).mockReturnValue(claim.promise);
    vi.mocked(visualRepository.fail).mockResolvedValue(
      visualJob({
        status: 'queued',
        lease_owner: null,
        lease_expires_at: null,
      }),
    );
    const visual = createDeferred<EpisodeVideoVisualCompletion>();
    const processVisualJob: ProcessEpisodeVideoVisualJob = vi
      .fn()
      .mockReturnValue(visual.promise);
    const worker = createVideoWorker({
      repository: makeRepository(null),
      visualRepository,
      processJob: vi.fn(),
      processVisualJob,
      leaseOwner: 'worker-1',
    });

    const running = worker.runOnce();
    await vi.waitFor(() => expect(visualRepository.claim).toHaveBeenCalled());
    const stopping = worker.stop(new Error('video worker shutting down'));
    claim.resolve(visualJob());

    await expect(stopping).resolves.toBeUndefined();
    await expect(running).resolves.toBe('failed');
    expect(processVisualJob).not.toHaveBeenCalled();
    expect(visualRepository.fail).toHaveBeenCalledWith(
      'episode-1',
      'worker-1',
      'video worker shutting down',
    );
  });

  it('a second stop waits for the already-active poll instead of returning early', async () => {
    const repository = makeRepository(null);
    const claim = createDeferred<EpisodeVideoJobRow | null>();
    vi.mocked(repository.claim).mockReturnValue(claim.promise);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
    });

    const running = worker.runOnce();
    await vi.waitFor(() => expect(repository.claim).toHaveBeenCalled());
    const firstStop = worker.stop(new Error('first stop'));
    const secondStop = worker.stop(new Error('second stop'));
    claim.resolve(null);

    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    await expect(running).resolves.toBe('empty');
  });

  it('returns stopped after shutdown and allows repeated stop calls with no active poll', async () => {
    vi.useFakeTimers();
    const repository = makeRepository(null);
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      leaseOwner: 'worker-1',
    });
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    await worker.stop();
    await expect(worker.runOnce()).resolves.toBe('stopped');
    await expect(worker.stop()).resolves.toBeUndefined();
  });

  it('creates a safe default lease owner when one is not injected', async () => {
    const repository = makeRepository(null);
    const visualRepository = makeVisualRepository(null);
    const worker = createVideoWorkerImplementation({
      repository,
      visualRepository,
      coordinator: {
        tryRunVideo: vi.fn(async (operation) => ({
          acquired: true as const,
          value: await operation(),
        })),
      } as never,
      processJob: vi.fn(),
      processVisualJob: vi.fn(),
      notify: vi.fn(),
    });

    await expect(worker.runOnce()).resolves.toBe('empty');
    expect(visualRepository.claim).toHaveBeenCalledWith(
      expect.stringMatching(/^.+:\d+:[0-9a-f-]{36}$/u),
    );
    expect(repository.claim).toHaveBeenCalledWith(
      expect.stringMatching(/^.+:\d+:[0-9a-f-]{36}$/u),
    );
  });
});

describe('render cost ledger', () => {
  beforeEach(() => {
    vi.useRealTimers();
    ledger.recordPipelineRun.mockReset();
    ledger.recordPipelineRun.mockResolvedValue(undefined);
  });

  function recordedRun(): PipelineRunInput {
    expect(ledger.recordPipelineRun).toHaveBeenCalledTimes(1);
    return ledger.recordPipelineRun.mock.calls[0]![0] as PipelineRunInput;
  }

  it('prices a completed render from the metrics the processor reported', async () => {
    const worker = createVideoWorker({
      repository: makeRepository(),
      processJob: vi.fn(async (_job, _source, context) => {
        context.reportRenderMetrics(renderMetrics);
        return completion;
      }),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');

    const run = recordedRun();
    expect(run).toMatchObject({
      pipeline: 'video_render',
      trigger: 'worker',
      status: 'completed',
      episodeId: 'episode-1',
      component: 'video-render',
    });
    expect(run.runRef).toMatch(/^[a-f0-9]{8}$/);
    expect(run.stages).toHaveLength(1);
    expect(run.stages[0]).toMatchObject({
      stage: 'video_render',
      provider: 'fly',
      status: 'completed',
      languageCode: 'zh-Hant',
      localizationId: 'localization-1',
      attempt: 1,
      elapsedMs: 480_000,
      pricing: {
        metricKey: 'machine_second_performance_1x_2gb',
        quantity: 480,
      },
    });
    expect(run.stages[0]?.usage).toMatchObject({
      machine: 'performance-1x-2gb',
      cgroupPeakObservedMb: 3_012.1,
    });
    expect(run.stages[0]?.usage?.['jobWallMs']).toEqual(expect.any(Number));
  });

  // A render that died after twenty minutes of x264 is the retry waste this
  // ledger exists to price, and the processor throws rather than returning on
  // that path — so the metrics can only come from the reporting callback.
  it('still bills the Fly seconds a failed render burned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.fail = vi.fn().mockResolvedValue({ status: 'queued' });
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(async (_job, _source, context) => {
        context.reportRenderMetrics({ ...renderMetrics, status: 'failed' });
        throw new Error('ffmpeg exited 1');
      }),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');

    const run = recordedRun();
    expect(run.status).toBe('failed');
    expect(run.stages[0]).toMatchObject({
      status: 'failed',
      pricing: { quantity: 480 },
    });
  });

  it('records the attempt but attributes no seconds when the render never started', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repository = makeRepository();
    repository.loadSource = vi
      .fn()
      .mockRejectedValue(new Error('source unavailable'));
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn(),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('failed');

    const run = recordedRun();
    expect(run).toMatchObject({
      pipeline: 'video_render',
      status: 'failed',
      episodeId: 'episode-1',
      stages: [],
    });
  });

  it('leaves visual work out of the render ledger', async () => {
    const worker = createVideoWorker({
      repository: makeRepository(),
      visualRepository: makeVisualRepository(visualJob()),
      processJob: vi.fn(),
      processVisualJob: vi.fn().mockResolvedValue(visualCompletion),
      leaseOwner: 'worker-1',
    });

    await expect(worker.runOnce()).resolves.toBe('completed');

    expect(ledger.recordPipelineRun).not.toHaveBeenCalled();
  });
});
