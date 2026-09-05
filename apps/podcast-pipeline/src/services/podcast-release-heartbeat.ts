import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

import { type FlyMachinesConfig, readFlyMachinesConfig } from '../lib/env.js';
import {
  createFlyMachinesClient,
  flyImageRefsMatch,
  type FlyMachinesClient,
} from './fly-machines.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';

export const PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS = 30_000;

interface ReleaseHeartbeatOptions {
  client?: PipelineSupabaseClient;
  machines?: FlyMachinesClient;
  flyConfig?: FlyMachinesConfig | null;
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

export async function podcastReleaseCanRender(
  options: Pick<ReleaseHeartbeatOptions, 'machines' | 'flyConfig'> = {},
): Promise<boolean> {
  const flyConfig =
    options.flyConfig === undefined
      ? readFlyMachinesConfig()
      : options.flyConfig;
  if (!flyConfig) {
    return true;
  }

  const machines =
    options.machines ??
    createFlyMachinesClient({
      appName: flyConfig.appName,
      token: flyConfig.token,
    });
  const fleet = await machines.listMachines();
  return fleet.some(
    (machine) =>
      machine.processGroup === 'render' &&
      flyImageRefsMatch(machine.image, flyConfig.currentImageRef),
  );
}

async function heartbeatOnce(
  options: ReleaseHeartbeatOptions,
): Promise<boolean> {
  if (!(await podcastReleaseCanRender(options))) {
    return false;
  }
  await markPodcastPipelineRelease(options.client ?? getPipelineSupabase());
  return true;
}

/**
 * The running Fly fleet is the release authority for operator retries. A new
 * app Machine may become healthy before the stopped render Machine is rolled to
 * the same image, so the heartbeat is published only when at least one render
 * Machine matches this app's FLY_IMAGE_REF. Until then the previous heartbeat
 * ages out and Supabase blocks retries instead of creating unclaimable work.
 */
export async function startPodcastReleaseHeartbeat(
  options: ReleaseHeartbeatOptions = {},
): Promise<() => void> {
  const intervalMs =
    options.intervalMs ?? PODCAST_RELEASE_HEARTBEAT_INTERVAL_MS;
  const logger = options.logger ?? console;
  let announced = false;

  const beat = async (): Promise<void> => {
    const active = await heartbeatOnce(options);
    if (active && !announced) {
      announced = true;
      logger.info(
        `[podcast-release] active visual_version=${EPISODE_VIDEO_VISUAL_VERSION}`,
      );
    } else if (!active) {
      announced = false;
    }
  };

  try {
    await beat();
  } catch (error: unknown) {
    logger.error('[podcast-release] initial heartbeat failed', error);
  }

  const timer = setInterval(() => {
    void (async () => {
      try {
        await beat();
      } catch (error: unknown) {
        logger.error('[podcast-release] heartbeat failed', error);
      }
    })();
  }, intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
