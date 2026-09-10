import type { OperationalSignal } from '../../../../shared/types.js';
import type { SignalInspection } from '../inspection/types.js';
import type { OperatorStore } from './store.js';

export async function renderSignals(
  store: OperatorStore,
  now: Date,
): Promise<OperationalSignal[]> {
  const targets = await store.renderTargets();
  return targets
    .filter((target) => target.renderStatus === 'failed')
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
