import path from 'node:path';

import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

import { readRenderOnDemandConfig } from './lib/env.js';
import { installProcessShutdown } from './lib/process-shutdown.js';
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
 * How long the queue must stay empty before an on-demand render machine exits.
 *
 * Six minutes outlasts the longest retry backoff the claim RPCs hand out
 * (`next_attempt_at = now() + interval '5 minutes'`), so a job waiting on its
 * third attempt does not cost an extra stop/start cycle.
 */
const IDLE_SHUTDOWN_MS = 360_000;

export interface VideoWorkerProcessOptions {
  createWorker?: (options: CreateVideoWorkerOptions) => EpisodeVideoWorker;
  livenessIntervalMs?: number;
  idleShutdownMs?: number;
  /** Defaults to the shared Fly on-demand gate; tests inject it directly. */
  onDemand?: boolean;
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
  const onDemandConfig = readRenderOnDemandConfig();
  const onDemand = options.onDemand ?? onDemandConfig.enabled;
  const idleShutdownMs = options.idleShutdownMs ?? IDLE_SHUTDOWN_MS;

  let liveness: NodeJS.Timeout | null = null;
  let videoWorker: EpisodeVideoWorker | null = null;
  let firstIdleAt: number | null = null;
  let stopping = false;

  const { shutdown } = installProcessShutdown(async (reason) => {
    if (liveness) clearInterval(liveness);
    await videoWorker?.stop(new Error(`Video worker stopping: ${reason}`));
  });

  // Runs right after a poll confirmed the queue was empty, so it can never
  // interrupt a render in flight.
  const trackIdle = (result: VideoWorkerPollResult): void => {
    if (!onDemand || stopping) return;
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

  const alwaysOnReason = onDemandConfig.enabled
    ? 'disabled by caller'
    : onDemandConfig.reason;
  logger.info(
    onDemand
      ? `[video-worker] on-demand: exits after ${idleShutdownMs}ms of an empty queue`
      : `[video-worker] always-on: ${alwaysOnReason}`,
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
