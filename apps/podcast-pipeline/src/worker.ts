// First import on purpose: the SDK has to be initialized before the modules it
// instruments are loaded. Without this the render process had no Sentry client
// at all, so every failed render was invisible outside `fly logs`.
import './observability/sentry-init.js';

import { installProcessShutdown } from './lib/process-shutdown.js';
import {
  capturePipelineException,
  flushSentry,
} from './observability/sentry.js';
import { processEpisodeVideoJob } from './services/episode-video-processor.js';
import { processEpisodeVideoVisualJob } from './services/episode-video-visual-processor.js';
import { assertVideoRenderRuntime } from './services/video/runtime-preflight.js';
import {
  createVideoVisualFailureNotifier,
  type VideoVisualFailureNotifier,
} from './services/video-visual-failure-notifier.js';
import {
  createVideoWorker,
  type CreateVideoWorkerOptions,
  type EpisodeVideoWorker,
  type ProcessEpisodeVideoVisualJob,
  type VideoWorkerPollResult,
} from './services/video-worker.js';
import { recordVisualPipelineCost } from './services/visual-cost.js';

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

/**
 * The longest a single boot may last before the machine hands the queue back.
 *
 * A normal batch is far shorter than this, so nothing trips it while the worker
 * is healthy. It exists for the case the idle exit cannot cover: a poll that
 * keeps throwing never reaches `onPollResult`, so the idle tracker never sees
 * `'empty'` and a dedicated CPU burns until somebody notices. Three hours caps
 * that at roughly a dollar.
 *
 * It stops claiming rather than aborting, so the worst case is 3 h plus one
 * render's timeout (90 min at the ceiling), and no render is ever thrown away
 * to meet the deadline. The `app` reconciler starts the machine again within
 * 30 s if work is still claimable, so the cost of a false trip is one boot.
 */
const MAX_UPTIME_MS = 10_800_000;

export interface VideoWorkerProcessOptions {
  createWorker?: (options: CreateVideoWorkerOptions) => EpisodeVideoWorker;
  createVisualFailureNotifier?: () => VideoVisualFailureNotifier;
  livenessIntervalMs?: number;
  idleShutdownMs?: number;
  maxUptimeMs?: number;
  exit?: (code: number) => void;
  logger?: Pick<Console, 'info'>;
}

export interface VideoWorkerProcessHandle {
  videoWorker: EpisodeVideoWorker;
  shutdown(reason?: string): Promise<void>;
}

export interface VideoWorkerRuntimePreflightOptions {
  assertRuntime?: typeof assertVideoRenderRuntime;
  captureException?: typeof capturePipelineException;
  flush?: typeof flushSentry;
  logger?: Pick<Console, 'info'>;
}

const processPricedVisualJob: ProcessEpisodeVideoVisualJob = async (
  job,
  source,
  context,
) => {
  const startedAt = new Date();
  try {
    const completion = await processEpisodeVideoVisualJob(job, source, context);
    await recordVisualPipelineCost({
      episodeId: job.episode_id,
      runRef: context.runId,
      attempt: job.attempt_count,
      status: 'completed',
      startedAt,
    });
    return completion;
  } catch (error) {
    await recordVisualPipelineCost({
      episodeId: job.episode_id,
      runRef: context.runId,
      attempt: job.attempt_count,
      status: 'failed',
      startedAt,
    });
    throw error;
  }
};

export function startVideoWorkerProcess(
  options: VideoWorkerProcessOptions = {},
): VideoWorkerProcessHandle {
  const logger = options.logger ?? console;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const idleShutdownMs = options.idleShutdownMs ?? IDLE_SHUTDOWN_MS;
  const maxUptimeMs = options.maxUptimeMs ?? MAX_UPTIME_MS;
  const visualFailureNotifier = (
    options.createVisualFailureNotifier ??
    (() => createVideoVisualFailureNotifier())
  )();

  let liveness: NodeJS.Timeout | null = null;
  let uptimeGuard: NodeJS.Timeout | null = null;
  let videoWorker: EpisodeVideoWorker | null = null;
  let firstIdleAt: number | null = null;
  let stopping = false;

  const { shutdown } = installProcessShutdown(async (reason) => {
    if (liveness) clearInterval(liveness);
    if (uptimeGuard) clearTimeout(uptimeGuard);
    visualFailureNotifier.stop();
    await videoWorker?.stop(new Error(`Video worker stopping: ${reason}`));
    await flushSentry();
  });

  // Exiting 0 leaves the machine `stopped` under this group's on-failure
  // restart policy (fly.toml). The always-on API process starts it again as
  // soon as claimable work exists (src/services/render-capacity.ts).
  const shutdownAndExit = async (reason: string): Promise<void> => {
    await shutdown(reason);
    exit(0);
  };

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
    void shutdownAndExit('idle queue');
  };

  videoWorker = (options.createWorker ?? createVideoWorker)({
    processJob: processEpisodeVideoJob,
    processVisualJob: processPricedVisualJob,
    onPollResult: trackIdle,
  });

  logger.info(
    `[video-worker] on-demand: exits after ${idleShutdownMs}ms of an empty queue, or ${maxUptimeMs}ms of uptime`,
  );

  const bootedAt = Date.now();
  // Draining first is the whole difference between this and a shutdown: it
  // stops new claims and waits, where shutdown()'s teardown aborts whatever is
  // rendering. Reversing these two lines throws away the render this guard
  // exists to protect.
  uptimeGuard = setTimeout(() => {
    if (stopping) return;
    stopping = true;
    logger.info(
      `[video-worker] uptime:shutdown uptimeMs=${Date.now() - bootedAt}`,
    );
    void (async () => {
      await videoWorker?.drain();
      await shutdownAndExit('max uptime');
    })();
  }, maxUptimeMs);

  // Visual planning is a shared prerequisite for all language renders. Its
  // terminal failure does not create a failed episode_videos row, so the
  // localized failure sweep cannot see it. Keep a parallel durable sweep alive
  // for the lifetime of this render process; the DB stamp makes delivery
  // at-least-once across ordinary worker restarts.
  visualFailureNotifier.start();

  // The worker's poll timer is unref'd so bootstrap() and tests never hang on
  // it, which means a process whose only job is polling would exit
  // immediately. This timer is the one ref'd handle holding the process open.
  liveness = setInterval(() => {
    logger.info('[video-worker] alive');
  }, options.livenessIntervalMs ?? LIVENESS_INTERVAL_MS);

  videoWorker.start();

  return { videoWorker, shutdown };
}

export async function preflightVideoWorkerRuntime(
  options: VideoWorkerRuntimePreflightOptions = {},
): Promise<void> {
  try {
    const runtime = await (options.assertRuntime ?? assertVideoRenderRuntime)();
    (options.logger ?? console).info(
      `[video-worker] runtime:ready ffmpeg=${runtime.ffmpegPath} fonts=${runtime.fontsDirectory}`,
    );
  } catch (error) {
    (options.captureException ?? capturePipelineException)(error, {
      component: 'video-worker',
      tags: { phase: 'runtime-preflight' },
    });
    await (options.flush ?? flushSentry)();
    throw error;
  }
}

if (process.env['NODE_ENV'] !== 'test') {
  await preflightVideoWorkerRuntime();
  startVideoWorkerProcess();
}
