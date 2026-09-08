import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';

/**
 * Retry eligibility shared by the episode read model and the queue board. Both
 * surfaces answer "can an operator press this?" about the same rows, and the
 * Postgres retry RPCs enforce exactly these conditions — one copy here stops the
 * two read models from disagreeing about which button to grey out.
 */

export function leaseIsActive(
  expiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (!expiresAt) {
    return false;
  }
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function isCurrentVisualVersion(
  version: string | null | undefined,
): boolean {
  return version === EPISODE_VIDEO_VISUAL_VERSION;
}

/**
 * A render can only be requeued against a visual checkpoint that is both
 * completed and current; `retry_episode_video_render` refuses anything else, so
 * offering the per-language button would only produce a 409.
 */
export function visualIsRenderable(
  visualStatus: string | null | undefined,
  visualVersion: string | null | undefined,
): boolean {
  return visualStatus === 'completed' && isCurrentVisualVersion(visualVersion);
}

export function canRestartRender(input: {
  renderStatus: string;
  renderLeaseExpiresAt: string | null;
  visualStatus: string | null | undefined;
  visualVersion: string | null | undefined;
  now: Date;
}): boolean {
  if (
    input.renderStatus === 'completed' ||
    !visualIsRenderable(input.visualStatus, input.visualVersion)
  ) {
    return false;
  }
  return !leaseIsActive(input.renderLeaseExpiresAt, input.now);
}
