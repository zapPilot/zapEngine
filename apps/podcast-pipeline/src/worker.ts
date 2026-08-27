// First import on purpose: the SDK has to be initialized before the modules it
// instruments are loaded. Without this the render process had no Sentry client
// at all, so every failed render was invisible outside `fly logs`.
import './observability/sentry-init.js';

import { installProcessShutdown } from './lib/process-shutdown.js';
import { flushSentry } from './observability/sentry.js';
import { processEpisodeVideoJob } from './services/episode-video-processor.js';
import { processEpisodeVideoVisualJob } from './services/episode-video-visual-processor.js';
import {
  createVideoWorker,
  type CreateVideoWorkerOptions,
  type EpisodeVideoWorker,
  type VideoWorkerPollResult,
} from './services/video-worker.js';

/**
 * Render process entry point — the `render` Fly process group runs this while
 * the `app` group serves HTTP. ffmpeg needs a dedicated CPU: on a shared vCPU
 * the burst balance runs out and x264 collapses to a fraction of realtime,
 * which also starves the API's health check off the proxy.
 */

// This group has no HTTP service and therefore no Fly health check, so a
// periodic line is the only evidence in `fly logs` that the machine is alive.
const LIVENESS_INTERVAL_MS = 300_000;

/**
 * How long the queue must stay empty before the render machine exits.
 *
 * Ninety seconds allows a freshly enqueued sibling job to become claimable,
 * but does not keep a performance CPU running through the database's five-
 * minute retry backoff. The always-on app reconciler wakes the machine again
 * when `next_attempt_at` arrives.
 */
const IDLE_SHUTDOWN_MS = 90_000;

export interface VideoWorkerProcessOptions {
  createWorker?: (options: CreateVideoWorkerOptions) => EpisodeVideoWorker;
  livenessIntervalMs?: number;
  idleShutdownMs?: number;
  exit?: (code: number) => void;
  logger?: Pick<Console, 'info'>;
}

export interface VideoWorkerProcessHandle {
  videoWorker: EpisodeVideoWorker;
  shutdown(reason?: string): Promise<void>;
}

export function startVideoWorkerProcess(
  options: VideoWorkerProcessOptions = {},
): VideoWorkerProcessHandle {
  const logger = options.logger ?? console;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const idleShutdownMs = options.idleShutdownMs ?? IDLE_SHUTDOWN_MS;

  let liveness: NodeJS.Timeout | null = null;
  let videoWorker: EpisodeVideoWorker | null = null;
  let firstIdleAt: number | null = null;
  let stopping = false;

  const { shutdown } = installProcessShutdown(async (reason) => {
    if (liveness) clearInterval(liveness);
    await videoWorker?.stop(new Error(`Video worker stopping: ${reason}`));
    await flushSentry();
  });

  // Runs right after a poll confirmed the queue was empty, so it can never
  // interrupt a render in flight.
  const trackIdle = (result: VideoWorkerPollResult): void => {
    if (stopping) return;
    if (result !== 'empty') {
      firstIdleAt = null;
      return;
    }

    firstIdleAt ??= Date.now();
    const idleMs = Date.now() - firstIdleAt;
    if (idleMs < idleShutdownMs) return;

    stopping = true;
    logger.info(`[video-worker] idle:shutdown idleMs=${idleMs}`);
    // Exiting 0 leaves the machine `stopped` under this group's on-failure
    // restart policy (fly.toml). The always-on API process starts it again as
    // soon as claimable work exists (src/services/render-capacity.ts).
    void (async () => {
      await shutdown('idle queue');
      exit(0);
    })();
  };

  videoWorker = (options.createWorker ?? createVideoWorker)({
    processJob: processEpisodeVideoJob,
    processVisualJob: processEpisodeVideoVisualJob,
    onPollResult: trackIdle,
  });

  logger.info(
    `[video-worker] on-demand: exits after ${idleShutdownMs}ms of an empty queue`,
  );

  // The worker's poll timer is unref'd so bootstrap() and tests never hang on
  // it, which means a process whose only job is polling would exit
  // immediately. This timer is the one ref'd handle holding the process open.
  liveness = setInterval(() => {
    logger.info('[video-worker] alive');
  }, options.livenessIntervalMs ?? LIVENESS_INTERVAL_MS);

  videoWorker.start();

  return { videoWorker, shutdown };
}

if (process.env['NODE_ENV'] !== 'test') {
  startVideoWorkerProcess();
}
