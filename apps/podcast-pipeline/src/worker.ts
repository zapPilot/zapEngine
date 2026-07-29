import path from 'node:path';

import dotenv from 'dotenv';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

import { installProcessShutdown } from './lib/process-shutdown.js';
import { processEpisodeVideoJob } from './services/episode-video-processor.js';
import { processEpisodeVideoVisualJob } from './services/episode-video-visual-processor.js';
import {
  createVideoWorker,
  type EpisodeVideoWorker,
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

export interface VideoWorkerProcessOptions {
  videoWorker?: EpisodeVideoWorker;
  livenessIntervalMs?: number;
  logger?: Pick<Console, 'info'>;
}

export interface VideoWorkerProcessHandle {
  videoWorker: EpisodeVideoWorker;
  shutdown(signal?: string): Promise<void>;
}

export function startVideoWorkerProcess(
  options: VideoWorkerProcessOptions = {},
): VideoWorkerProcessHandle {
  const logger = options.logger ?? console;
  const videoWorker =
    options.videoWorker ??
    createVideoWorker({
      processJob: processEpisodeVideoJob,
      processVisualJob: processEpisodeVideoVisualJob,
    });

  // The worker's poll timer is unref'd so bootstrap() and tests never hang on
  // it, which means a process whose only job is polling would exit
  // immediately. This timer is the one ref'd handle holding the process open.
  const liveness = setInterval(() => {
    logger.info('[video-worker] alive');
  }, options.livenessIntervalMs ?? LIVENESS_INTERVAL_MS);

  videoWorker.start();

  const { shutdown } = installProcessShutdown(async (signal) => {
    clearInterval(liveness);
    await videoWorker.stop(new Error(`Received ${signal}`));
  });

  return { videoWorker, shutdown };
}

if (process.env['NODE_ENV'] !== 'test') {
  startVideoWorkerProcess();
}
