import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import {
  type HeavyWorkCoordinator,
  heavyWorkCoordinator,
} from './heavy-work.js';
import {
  buildTelegramVideoCompletedMessage,
  buildTelegramVideoFailedMessage,
  sendMessage,
  type TelegramChatId,
} from './telegram.js';
import {
  type EpisodeVideoCompletion,
  type EpisodeVideoJobRow,
  type EpisodeVideoManifestPersistence,
  type EpisodeVideoSource,
  getVideoJobRepository,
  type VideoJobRepository,
} from './video-jobs.js';

export const VIDEO_WORKER_POLL_INTERVAL_MS = 15_000;
export const VIDEO_WORKER_HEARTBEAT_INTERVAL_MS = 60_000;
export const VIDEO_WORKER_LEASE_RENEW_RETRY_INTERVAL_MS = 5_000;
export const VIDEO_WORKER_MAX_LEASE_RENEW_FAILURES = 3;

export interface ProcessEpisodeVideoJobContext {
  signal: AbortSignal;
  saveManifest(input: EpisodeVideoManifestPersistence): Promise<void>;
}

export type ProcessEpisodeVideoJob = (
  job: EpisodeVideoJobRow,
  source: EpisodeVideoSource,
  context: ProcessEpisodeVideoJobContext,
) => Promise<EpisodeVideoCompletion>;

export type VideoWorkerPollResult =
  | 'busy'
  | 'heavy-work-busy'
  | 'empty'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface EpisodeVideoWorker {
  start(): void;
  runOnce(): Promise<VideoWorkerPollResult>;
  stop(reason?: unknown): Promise<void>;
}

interface VideoWorkerLogger {
  info(message: string): void;
  error(message: string, details?: unknown): void;
}

export interface CreateVideoWorkerOptions {
  processJob: ProcessEpisodeVideoJob;
  repository?: VideoJobRepository;
  coordinator?: HeavyWorkCoordinator;
  notify?: (chatId: TelegramChatId, text: string) => Promise<void>;
  leaseOwner?: string;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  leaseRenewRetryIntervalMs?: number;
  logger?: VideoWorkerLogger;
}

export function createVideoWorker(
  options: CreateVideoWorkerOptions,
): EpisodeVideoWorker {
  const repository = options.repository ?? getVideoJobRepository();
  const coordinator = options.coordinator ?? heavyWorkCoordinator;
  // Default to the throwing sender so the reap sweep can tell whether a failure
  // notice was actually delivered before marking it notified. The completion
  // path wraps this in safelyNotify, so a thrown error is still swallowed there.
  const notify = options.notify ?? sendMessage;
  const leaseOwner = options.leaseOwner ?? createVideoWorkerLeaseOwner();
  const pollIntervalMs =
    options.pollIntervalMs ?? VIDEO_WORKER_POLL_INTERVAL_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? VIDEO_WORKER_HEARTBEAT_INTERVAL_MS;
  const leaseRenewRetryIntervalMs =
    options.leaseRenewRetryIntervalMs ??
    VIDEO_WORKER_LEASE_RENEW_RETRY_INTERVAL_MS;
  const logger = options.logger ?? console;
  const shutdownController = new AbortController();
  let pollTimer: NodeJS.Timeout | null = null;
  let activePoll: Promise<VideoWorkerPollResult> | null = null;
  let activeJobController: AbortController | null = null;
  let started = false;
  let stopped = false;

  const schedulePoll = (delayMs: number): void => {
    if (!started || stopped || pollTimer) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void runScheduledPoll();
    }, delayMs);
    pollTimer.unref();
  };

  const runScheduledPoll = async (): Promise<void> => {
    try {
      await runOnce();
    } catch (error) {
      logger.error('[video-worker] poll failed', normalizeError(error));
    } finally {
      schedulePoll(pollIntervalMs);
    }
  };

  const executePoll = async (): Promise<VideoWorkerPollResult> => {
    if (stopped || shutdownController.signal.aborted) return 'stopped';

    // Notify terminal failures first. A job can reach 'failed' without a live
    // worker context — a source that never loaded, or crash recovery reaping an
    // expired lease inside claim_episode_video — so a single idempotent sweep is
    // the only place that reliably reaches the submitter.
    await reapFailedNotifications();
    if (stopped || shutdownController.signal.aborted) return 'stopped';

    const attempt = await coordinator.tryRunVideo(async () => {
      shutdownController.signal.throwIfAborted();
      const job = await repository.claim(leaseOwner);
      if (!job) return 'empty' as const;
      return processClaimedJob(job);
    });
    if (!attempt.acquired) return 'heavy-work-busy';
    return attempt.value;
  };

  const reapFailedNotifications = async (): Promise<void> => {
    let reaped;
    try {
      reaped = await repository.reapFailedNotifications();
    } catch (error) {
      logger.error(
        '[video-worker] failed to reap video failure notifications',
        normalizeError(error),
      );
      return;
    }
    for (const failure of reaped) {
      if (stopped || shutdownController.signal.aborted) return;
      try {
        await notify(
          failure.telegramChatId,
          buildTelegramVideoFailedMessage(failure.episodeId),
        );
      } catch (error) {
        // Leave the row unstamped so a later poll retries the notification.
        logger.error(
          '[video-worker] failure notification not delivered; will retry',
          normalizeError(error),
        );
        continue;
      }
      try {
        await repository.markFailureNotified(failure.episodeLocalizationId);
      } catch (error) {
        // Delivered but not stamped — a later poll may re-send (rare duplicate).
        logger.error(
          '[video-worker] failed to record failure notification',
          normalizeError(error),
        );
      }
    }
  };

  const runOnce = async (): Promise<VideoWorkerPollResult> => {
    if (stopped) return 'stopped';
    if (activePoll) return 'busy';

    const poll = executePoll();
    activePoll = poll;
    try {
      return await poll;
    } finally {
      if (activePoll === poll) activePoll = null;
    }
  };

  const processClaimedJob = async (
    job: EpisodeVideoJobRow,
  ): Promise<'completed' | 'failed'> => {
    const jobController = new AbortController();
    activeJobController = jobController;
    const relayShutdown = () => {
      jobController.abort(shutdownController.signal.reason);
    };
    shutdownController.signal.addEventListener('abort', relayShutdown, {
      once: true,
    });
    const stopHeartbeat = startLeaseHeartbeat({
      repository,
      episodeLocalizationId: job.episode_localization_id,
      leaseOwner,
      intervalMs: heartbeatIntervalMs,
      retryIntervalMs: leaseRenewRetryIntervalMs,
      controller: jobController,
      logger,
    });
    let source: EpisodeVideoSource | null = null;

    try {
      jobController.signal.throwIfAborted();
      source = await repository.loadSource(job.episode_localization_id);
      jobController.signal.throwIfAborted();
      const completion = await options.processJob(job, source, {
        signal: jobController.signal,
        saveManifest: async (manifest) => {
          jobController.signal.throwIfAborted();
          const saved = await repository.saveManifest(
            job.episode_localization_id,
            leaseOwner,
            manifest,
          );
          if (!saved) {
            const error = new VideoLeaseLostError(job.episode_localization_id);
            jobController.abort(error);
            throw error;
          }
        },
      });
      jobController.signal.throwIfAborted();
      const completed = await repository.complete(
        job.episode_localization_id,
        leaseOwner,
        completion,
      );
      if (!completed) {
        throw new VideoLeaseLostError(job.episode_localization_id);
      }

      const latestJob = await repository
        .find(job.episode_localization_id)
        .catch((error) => {
          logger.error(
            '[video-worker] completed job notification lookup failed',
            normalizeError(error),
          );
          return job;
        });
      if (latestJob?.telegram_chat_id) {
        await safelyNotify(
          notify,
          latestJob.telegram_chat_id,
          buildTelegramVideoCompletedMessage(source.episodeId),
          logger,
        );
      }
      return 'completed';
    } catch (error) {
      // The failure notification is intentionally not sent here. Releasing the
      // job flips it to 'queued' (retry pending) or 'failed' (terminal); the
      // reap sweep in executePoll then notifies terminal failures exactly once,
      // which also covers the source-never-loaded and crash-recovery paths that
      // never reach this catch with a usable episode id.
      const failedJob = await repository
        .fail(
          job.episode_localization_id,
          leaseOwner,
          videoJobErrorMessage(error),
        )
        .catch((failError) => {
          logger.error(
            '[video-worker] failed to release video job',
            normalizeError(failError),
          );
          return null;
        });
      logger.error('[video-worker] job failed', {
        episodeLocalizationId: job.episode_localization_id,
        attemptCount: job.attempt_count,
        status: failedJob?.status ?? 'unknown',
        error: videoJobErrorMessage(error),
      });
      return 'failed';
    } finally {
      stopHeartbeat();
      shutdownController.signal.removeEventListener('abort', relayShutdown);
      if (activeJobController === jobController) activeJobController = null;
    }
  };

  return {
    start(): void {
      if (started || stopped) return;
      started = true;
      logger.info(`[video-worker] started leaseOwner=${leaseOwner}`);
      schedulePoll(0);
    },

    runOnce,

    async stop(
      reason = new Error('Video worker shutting down'),
    ): Promise<void> {
      if (stopped) {
        if (activePoll) await activePoll;
        return;
      }
      stopped = true;
      started = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      shutdownController.abort(reason);
      activeJobController?.abort(reason);
      if (activePoll) await activePoll;
      logger.info('[video-worker] stopped');
    },
  };
}

export function isVideoWorkerEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment['VIDEO_WORKER_ENABLED']?.trim() === 'true';
}

function createVideoWorkerLeaseOwner(): string {
  return `${hostname()}:${process.pid}:${randomUUID()}`;
}

function startLeaseHeartbeat(input: {
  repository: VideoJobRepository;
  episodeLocalizationId: string;
  leaseOwner: string;
  intervalMs: number;
  retryIntervalMs: number;
  controller: AbortController;
  logger: VideoWorkerLogger;
}): () => void {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let consecutiveFailures = 0;

  const scheduleIn = (delayMs: number): void => {
    if (stopped || input.controller.signal.aborted) return;
    timer = setTimeout(() => {
      timer = null;
      void renew();
    }, delayMs);
    timer.unref();
  };

  const renew = async (): Promise<void> => {
    let renewed: boolean;
    try {
      renewed = await input.repository.renewLease(
        input.episodeLocalizationId,
        input.leaseOwner,
      );
    } catch (error) {
      // A thrown error is a transient RPC failure (network blip, 5xx), not proof
      // the lease is gone — the DB lease is still valid for up to ~10 minutes.
      // Retry a few times before giving up so one flaky call does not discard an
      // otherwise-healthy render and consume a scarce retry attempt.
      consecutiveFailures += 1;
      input.logger.error(
        `[video-worker] lease heartbeat call failed (attempt ${consecutiveFailures}/${VIDEO_WORKER_MAX_LEASE_RENEW_FAILURES})`,
        normalizeError(error),
      );
      if (consecutiveFailures >= VIDEO_WORKER_MAX_LEASE_RENEW_FAILURES) {
        input.controller.abort(
          new Error('Video lease heartbeat failed', { cause: error }),
        );
        return;
      }
      scheduleIn(input.retryIntervalMs);
      return;
    }
    if (!renewed) {
      // A definitive false means another owner holds the lease — abort now.
      input.controller.abort(
        new VideoLeaseLostError(input.episodeLocalizationId),
      );
      return;
    }
    consecutiveFailures = 0;
    scheduleIn(input.intervalMs);
  };

  scheduleIn(input.intervalMs);
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

class VideoLeaseLostError extends Error {
  constructor(episodeLocalizationId: string) {
    super(`Video job lease lost: ${episodeLocalizationId}`);
    this.name = 'VideoLeaseLostError';
  }
}

async function safelyNotify(
  notify: (chatId: TelegramChatId, text: string) => Promise<void>,
  chatId: TelegramChatId,
  message: string,
  logger: VideoWorkerLogger,
): Promise<void> {
  try {
    await notify(chatId, message);
  } catch (error) {
    logger.error(
      '[video-worker] Telegram notification failed',
      normalizeError(error),
    );
  }
}

function videoJobErrorMessage(error: unknown): string {
  const normalized = normalizeError(error);
  return normalized.message.slice(0, 4_000);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
