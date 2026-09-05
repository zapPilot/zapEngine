import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import {
  getPipelineSupabase,
  throwSupabaseError,
  type PipelineSupabaseClient,
} from './supabase-client.js';

export const PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS = 30_000;

interface ReleaseHeartbeatOptions {
  client?: PipelineSupabaseClient;
  intervalMs?: number;
  logger?: Pick<Console, 'info' | 'error'>;
}

export async function markPodcastPipelineRelease(
  client: PipelineSupabaseClient = getPipelineSupabase(),
): Promise<void> {
  const { error } = await client.rpc('mark_podcast_pipeline_release', {
    p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
  });
  if (error) {
    throwSupabaseError(error);
  }
}

/**
 * The app process is the release authority for operator retries. Mark once
 * before HTTP starts, then refresh often enough that Supabase can fail closed
 * when the app is stopped, rolled back, or stranded on an older image.
 */
export async function startPodcastReleaseHeartbeat(
  options: ReleaseHeartbeatOptions = {},
): Promise<() => void> {
  const client = options.client ?? getPipelineSupabase();
  const intervalMs =
    options.intervalMs ?? PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS;
  const logger = options.logger ?? console;

  await markPodcastPipelineRelease(client);
  logger.info(
    `[podcast-release] active visual_version=${EPISODE_VIDEO_VISUAL_VERSION}`,
  );

  const timer = setInterval(() => {
    void markPodcastPipelineRelease(client).catch((error: unknown) => {
      logger.error('[podcast-release] heartbeat failed', error);
    });
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
