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
  type EpisodeVideoVisualCompletion,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  getVideoJobRepository,
  getVideoVisualJobRepository,
  type ProcessEpisodeVideoVisualJobContext,
  type VideoJobRepository,
  type VisualJobRepository,
} from './video-jobs.js';

export const VIDEO_WORKER_POLL_INTERVAL_MS = 15_000;
export const VIDEO_WORKER_HEARTBEAT_INTERVAL_MS = 60_000;
export const VIDEO_WORKER_LEASE_RENEW_RETRY_INTERVAL_MS = 5_000;
export const VIDEO_WORKER_MAX_LEASE_RENEW_FAILURES = 3;

export interface ProcessEpisodeVideoJobContext {
  signal: AbortSignal;
  runId: string;
  saveManifest(input: EpisodeVideoManifestPersistence): Promise<void>;
}

export type ProcessEpisodeVideoJob = (
  job: EpisodeVideoJobRow,
  source: EpisodeVideoSource,
  context: ProcessEpisodeVideoJobContext,
) => Promise<EpisodeVideoCompletion>;

export type ProcessEpisodeVideoVisualJob = (
  job: EpisodeVideoVisualJobRow,
  source: EpisodeVideoVisualSource,
  context: ProcessEpisodeVideoVisualJobContext,
) => Promise<EpisodeVideoVisualCompletion>;

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
  processVisualJob: ProcessEpisodeVideoVisualJob;
  repository?: VideoJobRepository;
  visualRepository?: VisualJobRepository;
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
  const visualRepository =
    options.visualRepository ?? getVideoVisualJobRepository();
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
      const visualJob = await visualRepository.claim(leaseOwner);
      if (visualJob) return processClaimedVisualJob(visualJob);

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

  /* jscpd:ignore-start -- processClaimedVisualJob and processClaimedJob share an irreducible job-lifecycle pattern; different types prevent extraction */
  const processClaimedVisualJob = async (
    job: EpisodeVideoVisualJobRow,
  ): Promise<'completed' | 'failed'> => {
    const jobController = new AbortController();
    const runId = createVideoJobRunId();
    activeJobController = jobController;
    const relayShutdown = () => {
      jobController.abort(shutdownController.signal.reason);
    };
    shutdownController.signal.addEventListener('abort', relayShutdown, {
      once: true,
    });
    const stopHeartbeat = startLeaseHeartbeat({
      repository: visualRepository,
      jobId: job.episode_id,
      leaseOwner,
      intervalMs: heartbeatIntervalMs,
      retryIntervalMs: leaseRenewRetryIntervalMs,
      controller: jobController,
      logger,
      kind: 'visual',
    });

    logger.info(
      `[video-worker] visual:start run=${runId} episode=${job.episode_id}`,
    );
    try {
      jobController.signal.throwIfAborted();
      const source = await visualRepository.loadSource(job.episode_id);
      jobController.signal.throwIfAborted();
      const visual = await options.processVisualJob(job, source, {
        signal: jobController.signal,
        runId,
      });
      jobController.signal.throwIfAborted();
      const completed = await visualRepository.complete(
        job.episode_id,
        leaseOwner,
        visual,
      );
      if (!completed) {
        throw new VideoLeaseLostError('visual', job.episode_id);
      }
      logger.info(
        `[video-worker] visual:done run=${runId} episode=${job.episode_id}`,
      );
      return 'completed';
    } catch (error) {
      const failedJob = await visualRepository
        .fail(job.episode_id, leaseOwner, videoJobErrorMessage(error))
        .catch((failError) => {
          logger.error(
            '[video-worker] failed to release visual job',
            normalizeError(failError),
          );
          return null;
        });
      logger.error('[video-worker] visual:failed', {
        run: runId,
        episodeId: job.episode_id,
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
    const runId = createVideoJobRunId();
    activeJobController = jobController;
    const relayShutdown = () => {
      jobController.abort(shutdownController.signal.reason);
    };
    shutdownController.signal.addEventListener('abort', relayShutdown, {
      once: true,
    });
    const stopHeartbeat = startLeaseHeartbeat({
      repository,
      jobId: job.episode_localization_id,
      leaseOwner,
      intervalMs: heartbeatIntervalMs,
      retryIntervalMs: leaseRenewRetryIntervalMs,
      controller: jobController,
      logger,
      kind: 'localization',
    });
    let source: EpisodeVideoSource | null = null;

    try {
      jobController.signal.throwIfAborted();
      source = await repository.loadSource(job.episode_localization_id);
      jobController.signal.throwIfAborted();
      logger.info(
        `[video-worker] video:render:start run=${runId} episode=${source.episodeId} language=${source.languageCode} localization=${job.episode_localization_id}`,
      );
      const completion = await options.processJob(job, source, {
        signal: jobController.signal,
        runId,
        saveManifest: async (manifest) => {
          jobController.signal.throwIfAborted();
          const saved = await repository.saveManifest(
            job.episode_localization_id,
            leaseOwner,
            manifest,
          );
          if (!saved) {
            const error = new VideoLeaseLostError(
              'localization',
              job.episode_localization_id,
            );
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
        throw new VideoLeaseLostError(
          'localization',
          job.episode_localization_id,
        );
      }
      logger.info(
        `[video-worker] video:render:done run=${runId} episode=${source.episodeId} language=${source.languageCode} localization=${job.episode_localization_id}`,
      );

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
        run: runId,
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
  /* jscpd:ignore-end */

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

function createVideoWorkerLeaseOwner(): string {
  return `${hostname()}:${process.pid}:${randomUUID()}`;
}

function createVideoJobRunId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 8);
}

interface LeaseRepository {
  renewLease(jobId: string, leaseOwner: string): Promise<boolean>;
}

function startLeaseHeartbeat(input: {
  repository: LeaseRepository;
  jobId: string;
  leaseOwner: string;
  intervalMs: number;
  retryIntervalMs: number;
  controller: AbortController;
  logger: VideoWorkerLogger;
  kind: 'visual' | 'localization';
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
        input.jobId,
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
      input.controller.abort(new VideoLeaseLostError(input.kind, input.jobId));
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
  constructor(kind: 'visual' | 'localization', jobId: string) {
    super(`Video ${kind} job lease lost: ${jobId}`);
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
