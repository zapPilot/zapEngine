import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import { errorMessage, toError } from '../lib/errorMessage.js';
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
  EPISODE_VIDEO_VISUAL_VERSION,
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
import type { EpisodeVideoProgressUpdate } from './video-progress.js';

export const VIDEO_WORKER_POLL_INTERVAL_MS = 15_000;
export const VIDEO_WORKER_HEARTBEAT_INTERVAL_MS = 60_000;
/**
 * Progress gets its own timer rather than riding the lease heartbeat. The client
 * polls every 10s, so a 60s flush would leave most polls showing an unchanged
 * number — exactly the frozen bar this feature exists to remove. Renewing the
 * lease 6x more often is not an option: renew_episode_video_lease re-checks the
 * completed-visual join and its `false` aborts the job.
 */
export const VIDEO_WORKER_PROGRESS_FLUSH_INTERVAL_MS = 10_000;
export const VIDEO_WORKER_LEASE_RENEW_RETRY_INTERVAL_MS = 5_000;
export const VIDEO_WORKER_LEASE_RENEW_MAX_RETRY_INTERVAL_MS = 60_000;
// Mirrors `lease_expires_at = now() + interval '10 minutes'` in the claim and
// renew RPCs (supabase/schema.sql).
export const VIDEO_WORKER_LEASE_TTL_MS = 600_000;
// Give up while there is still lease left, so a lost race surfaces as a clean
// abort rather than a write against an expired lease.
export const VIDEO_WORKER_LEASE_RENEW_SAFETY_MARGIN_MS = 90_000;

export interface ProcessEpisodeVideoJobContext {
  signal: AbortSignal;
  runId: string;
  saveManifest(input: EpisodeVideoManifestPersistence): Promise<void>;
  /** See the note on ProcessEpisodeVideoVisualJobContext.reportProgress. */
  reportProgress(update: EpisodeVideoProgressUpdate): void;
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
  progressFlushIntervalMs?: number;
  leaseRenewRetryIntervalMs?: number;
  logger?: VideoWorkerLogger;
  /**
   * Called after each *scheduled* poll (not a direct `runOnce`). The on-demand
   * render process group uses it to notice a queue that has stayed empty and
   * exit; see src/worker.ts.
   */
  onPollResult?: (result: VideoWorkerPollResult) => void;
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
  const progressFlushIntervalMs =
    options.progressFlushIntervalMs ?? VIDEO_WORKER_PROGRESS_FLUSH_INTERVAL_MS;
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
      const result = await runOnce();
      options.onPollResult?.(result);
    } catch (error) {
      logger.error('[video-worker] poll failed', toError(error));
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
        toError(error),
      );
      return;
    }
    for (const failure of reaped) {
      if (stopped || shutdownController.signal.aborted) return;
      try {
        await notify(
          failure.telegramChatId,
          buildTelegramVideoFailedMessage(failure.episodeId, failure.lastError),
        );
      } catch (error) {
        // Leave the row unstamped so a later poll retries the notification.
        logger.error(
          '[video-worker] failure notification not delivered; will retry',
          toError(error),
        );
        continue;
      }
      try {
        await repository.markFailureNotified(failure.episodeLocalizationId);
      } catch (error) {
        // Delivered but not stamped — a later poll may re-send (rare duplicate).
        logger.error(
          '[video-worker] failed to record failure notification',
          toError(error),
        );
      }
    }
  };

  /* jscpd:ignore-start -- processClaimedVisualJob and processClaimedJob share an irreducible job-lifecycle pattern; different types prevent extraction */
  const processClaimedVisualJob = async (
    job: EpisodeVideoVisualJobRow,
  ): Promise<'completed' | 'failed'> => {
    const { controller: jobController, releaseShutdownRelay } =
      createJobController(shutdownController.signal);
    const runId = createVideoJobRunId();
    activeJobController = jobController;
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
    const progress = createProgressCell();
    const stopProgressFlush = startProgressFlush({
      report: (update) =>
        visualRepository.reportProgress(job.episode_id, leaseOwner, update),
      cell: progress,
      intervalMs: progressFlushIntervalMs,
      controller: jobController,
      logger,
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
        reportProgress: progress.set,
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
            toError(failError),
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
      stopProgressFlush();
      releaseShutdownRelay();
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
    const { controller: jobController, releaseShutdownRelay } =
      createJobController(shutdownController.signal);
    const runId = createVideoJobRunId();
    activeJobController = jobController;
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
    const progress = createProgressCell();
    const stopProgressFlush = startProgressFlush({
      report: (update) =>
        repository.reportProgress(
          job.episode_localization_id,
          leaseOwner,
          update,
        ),
      cell: progress,
      intervalMs: progressFlushIntervalMs,
      controller: jobController,
      logger,
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
        reportProgress: progress.set,
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
            toError(error),
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
            toError(failError),
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
      stopProgressFlush();
      releaseShutdownRelay();
      if (activeJobController === jobController) activeJobController = null;
    }
  };
  /* jscpd:ignore-end */

  return {
    start(): void {
      if (started || stopped) return;
      started = true;
      logger.info(
        `[video-worker] started lease_owner=${leaseOwner} visual_version=${EPISODE_VIDEO_VISUAL_VERSION}`,
      );
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

// Bind a job's abort controller to worker shutdown. `executePoll` only checks the
// shutdown signal *before* each claim, so a stop() landing while the claim RPC is
// in flight hands back a job whose controller is created against an already-
// aborted signal — and addEventListener never fires on one of those. Relaying
// that pending abort by hand is what lets stop() reach the render: otherwise the
// listener stays silent, `activeJobController` was still null when stop() read it,
// and ffmpeg runs to its own deadline while stop() waits on the poll and Fly
// SIGKILLs the machine with the DB lease still held.
function createJobController(shutdownSignal: AbortSignal): {
  controller: AbortController;
  releaseShutdownRelay: () => void;
} {
  const controller = new AbortController();
  const relayShutdown = () => {
    controller.abort(shutdownSignal.reason);
  };
  shutdownSignal.addEventListener('abort', relayShutdown, { once: true });
  if (shutdownSignal.aborted) relayShutdown();
  return {
    controller,
    releaseShutdownRelay: () => {
      shutdownSignal.removeEventListener('abort', relayShutdown);
    },
  };
}

/**
 * A rescheduling timer handle both background loops park their `setTimeout` in,
 * so cancelling one is a single call rather than a repeated null-and-clear dance.
 */
interface PendingTimer {
  handle: NodeJS.Timeout | null;
}

function cancelPendingTimer(pending: PendingTimer): void {
  if (pending.handle) {
    clearTimeout(pending.handle);
    pending.handle = null;
  }
}

/**
 * Function properties rather than methods, because `set` is handed straight to a
 * processor as its `reportProgress` and must stay callable detached from the cell.
 */
interface ProgressCell {
  set: (update: EpisodeVideoProgressUpdate) => void;
  take: () => EpisodeVideoProgressUpdate | null;
}

/**
 * Coalesces progress reports down to the newest one. ffmpeg emits roughly two
 * per second and the asset planner several per scene, so a write per event would
 * be ~1200 round trips per render to display a number that is polled every 10s.
 */
function createProgressCell(): ProgressCell {
  let latest: EpisodeVideoProgressUpdate | null = null;
  return {
    set: (update) => {
      latest = update;
    },
    take: () => {
      const pending = latest;
      latest = null;
      return pending;
    },
  };
}

/**
 * Deliberately much simpler than startLeaseHeartbeat: no backoff, no retry
 * budget, and it never touches the controller. Progress is cosmetic, so neither
 * a thrown error nor a `false` return (lease gone, row reset) may abort a render
 * — the lease heartbeat is the only thing allowed to make that call.
 */
function startProgressFlush(input: {
  report(update: EpisodeVideoProgressUpdate): Promise<boolean>;
  cell: ProgressCell;
  intervalMs: number;
  controller: AbortController;
  logger: VideoWorkerLogger;
}): () => void {
  const pending: PendingTimer = { handle: null };
  let stopped = false;
  let loggedFailure = false;

  const scheduleFlush = (): void => {
    pending.handle = setTimeout(() => {
      pending.handle = null;
      void flush();
    }, input.intervalMs);
    pending.handle.unref();
  };

  const flush = async (): Promise<void> => {
    const update = input.cell.take();
    if (update !== null) {
      try {
        await input.report(update);
      } catch (error) {
        if (!loggedFailure) {
          loggedFailure = true;
          input.logger.error(
            '[video-worker] progress reporting unavailable; continuing',
            toError(error),
          );
        }
      }
    }
    if (stopped || input.controller.signal.aborted) return;
    scheduleFlush();
  };

  scheduleFlush();

  return () => {
    stopped = true;
    cancelPendingTimer(pending);
  };
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
  const pending: PendingTimer = { handle: null };
  let stopped = false;
  let consecutiveFailures = 0;
  // The claim RPC just refreshed the lease, so the retry budget runs from here
  // rather than from the first failure.
  let lastRenewedAt = Date.now();

  const renewBudgetMs =
    VIDEO_WORKER_LEASE_TTL_MS - VIDEO_WORKER_LEASE_RENEW_SAFETY_MARGIN_MS;

  const scheduleIn = (delayMs: number): void => {
    if (stopped || input.controller.signal.aborted) return;
    pending.handle = setTimeout(() => {
      pending.handle = null;
      void renew();
    }, delayMs);
    pending.handle.unref();
  };

  const retryDelayMs = (): number =>
    Math.min(
      input.retryIntervalMs * 2 ** (consecutiveFailures - 1),
      VIDEO_WORKER_LEASE_RENEW_MAX_RETRY_INTERVAL_MS,
    );

  const renew = async (): Promise<void> => {
    let renewed: boolean;
    try {
      renewed = await input.repository.renewLease(
        input.jobId,
        input.leaseOwner,
      );
    } catch (error) {
      // A thrown error is a transient RPC failure (network blip, 5xx), not proof
      // the lease is gone — the DB lease stays valid for VIDEO_WORKER_LEASE_TTL_MS
      // after the last success. Budget the retries against that clock instead of
      // a fixed attempt count: three attempts at a fixed 5s interval gave up
      // after ~10 seconds and discarded renders that still held nine minutes of
      // valid lease, burning one of only three allowed attempts each time.
      consecutiveFailures += 1;
      const staleForMs = Date.now() - lastRenewedAt;
      const nextDelayMs = retryDelayMs();
      input.logger.error(
        `[video-worker] lease heartbeat call failed (attempt ${consecutiveFailures}, stale ${formatSeconds(staleForMs)}/${formatSeconds(renewBudgetMs)})`,
        toError(error),
      );
      if (staleForMs + nextDelayMs >= renewBudgetMs) {
        input.controller.abort(
          new Error(
            `Video lease heartbeat failed for ${formatSeconds(staleForMs)} after ${consecutiveFailures} attempts`,
            { cause: error },
          ),
        );
        return;
      }
      scheduleIn(nextDelayMs);
      return;
    }
    if (!renewed) {
      // A definitive false means another owner holds the lease — abort now.
      input.controller.abort(new VideoLeaseLostError(input.kind, input.jobId));
      return;
    }
    lastRenewedAt = Date.now();
    consecutiveFailures = 0;
    scheduleIn(input.intervalMs);
  };

  scheduleIn(input.intervalMs);
  return () => {
    stopped = true;
    cancelPendingTimer(pending);
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
    logger.error('[video-worker] Telegram notification failed', toError(error));
  }
}

function formatSeconds(milliseconds: number): string {
  return `${Math.round(milliseconds / 1_000)}s`;
}

function videoJobErrorMessage(error: unknown): string {
  return errorMessage(error).slice(0, 4_000);
}
