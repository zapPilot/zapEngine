import type { OperationalSignal } from '../../../../shared/types.js';
import { visualIsRenderable } from '../../podcast-retry-eligibility.js';
import type { SignalInspection } from '../inspection/types.js';
import type { OperatorStore, RenderTarget } from './store.js';

/**
 * A failed render is only an incident while an operator could still requeue it.
 * `retry_episode_video_render` refuses a visual checkpoint that is not both
 * completed and current, and `assert_episode_video_not_abandoned` refuses an
 * abandoned episode before the version fence even runs — so these rows are
 * terminal history, not work. Reporting them anyway pinned the social domain to
 * `degraded` on all 18 failed renders in production, every one of which an
 * operator had already abandoned (17 also sat on visual versions v2-v4), and
 * every triage run spent its attention re-deciding the same unpressable retry.
 */
function isRetryableRenderFailure(target: RenderTarget): boolean {
  return (
    target.renderStatus === 'failed' &&
    !target.abandonedAt &&
    visualIsRenderable(target.visualStatus, target.visualVersion)
  );
}

export async function renderSignals(
  store: OperatorStore,
  now: Date,
): Promise<OperationalSignal[]> {
  const targets = await store.renderTargets();
  return targets
    .filter((target) => isRetryableRenderFailure(target))
    .map((target) => ({
      fingerprint: `social-queue:render/${target.localizationId}`,
      source: 'social-queue',
      domain: 'social',
      status: 'degraded',
      title: 'Render job failed',
      detail:
        'Inspect the exact localization before attempting one bounded retry.',
      evidence: {
        episodeId: target.episodeId,
        localizationId: target.localizationId,
      },
      observedAt: now.toISOString(),
      url: null,
    }));
}
export async function inspectRender(
  store: OperatorStore,
  fingerprint: string,
  now: Date,
): Promise<SignalInspection> {
  const localizationId = fingerprint.slice('social-queue:render/'.length);
  const target = (await store.renderTargets()).find(
    (row) => row.localizationId === localizationId,
  );
  return {
    fingerprint,
    source: 'social-queue',
    status: target ? 'ok' : 'not-found',
    inspectedAt: now.toISOString(),
    summary: target
      ? `Render status: ${target.renderStatus}`
      : 'Exact render job is unavailable.',
    entities: [],
    evidence: target ? { ...target } : {},
    gaps: [],
  };
}
