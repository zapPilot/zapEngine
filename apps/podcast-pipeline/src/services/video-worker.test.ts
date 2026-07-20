import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../__fixtures__/index-test.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import type {
  EpisodeVideoCompletion,
  EpisodeVideoJobRow,
  EpisodeVideoSource,
  VideoJobRepository,
} from './video-jobs.js';
import {
  createVideoWorker,
  isVideoWorkerEnabled,
  type ProcessEpisodeVideoJob,
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
};

const completion: EpisodeVideoCompletion = {
  mp4Url: 'https://cdn.example.com/video.mp4',
  thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
  manifestUrl: 'https://cdn.example.com/manifest.json',
  captionsAssUrl: 'https://cdn.example.com/captions.ass',
  r2Prefix: 'episodes/episode-1/video',
  durationSeconds: 90,
};

function job(overrides: Partial<EpisodeVideoJobRow> = {}): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    status: 'processing',
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

function makeRepository(
  claimed: EpisodeVideoJobRow | null = job(),
): VideoJobRepository {
  return {
    enqueue: vi.fn(),
    claim: vi.fn().mockResolvedValue(claimed),
    renewLease: vi.fn().mockResolvedValue(true),
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

describe('createVideoWorker', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('processes one job, persists provenance, completes, and notifies the latest chat', async () => {
    const repository = makeRepository();
    const notify = vi.fn().mockResolvedValue(undefined);
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

  it('does not claim while an ingest is active', async () => {
    const repository = makeRepository();
    const coordinator = createHeavyWorkCoordinator();
    const ingest = createDeferred<void>();
    const runningIngest = coordinator.runIngest(() => ingest.promise);
    await vi.waitFor(() =>
      expect(coordinator.getState().activeIngests).toBe(1),
    );
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

  it('keeps concurrency at one', async () => {
    const repository = makeRepository();
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    await expect(worker.runOnce()).resolves.toBe('busy');
    expect(repository.claim).toHaveBeenCalledTimes(1);
    render.resolve(completion);
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

  it('aborts the render after repeated heartbeat failures', async () => {
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
            () => reject(new Error('aborted render')),
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
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(running).resolves.toBe('failed');
    expect(repository.renewLease).toHaveBeenCalledTimes(3);
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

  it('returns busy when a poll is already in flight', async () => {
    const repository = makeRepository();
    const render = createDeferred<EpisodeVideoCompletion>();
    const worker = createVideoWorker({
      repository,
      processJob: vi.fn().mockReturnValue(render.promise),
      notify: vi.fn().mockResolvedValue(undefined),
      leaseOwner: 'worker-1',
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(repository.loadSource).toHaveBeenCalled());
    await expect(worker.runOnce()).resolves.toBe('busy');
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

  it('returns stopped when stop() runs while no active poll exists', async () => {
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
  });
});

describe('isVideoWorkerEnabled', () => {
  it('requires an explicit true value', () => {
    expect(isVideoWorkerEnabled({ VIDEO_WORKER_ENABLED: 'true' })).toBe(true);
    expect(isVideoWorkerEnabled({ VIDEO_WORKER_ENABLED: 'false' })).toBe(false);
    expect(isVideoWorkerEnabled({})).toBe(false);
  });
});
