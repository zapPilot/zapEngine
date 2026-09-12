import { describe, expect, it, vi } from 'vitest';
import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { renderSignals } from './render-signals.js';
import type { OperatorStore, RenderTarget } from './store.js';

const now = new Date('2026-09-11T12:00:00Z');
const target: RenderTarget = {
  episodeId: '11111111-1111-4111-8111-111111111111',
  localizationId: '22222222-2222-4222-8222-222222222222',
  renderStatus: 'failed',
  renderCompletedAt: null,
  renderLeaseExpiresAt: null,
  visualStatus: 'completed',
  visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
  deploymentOpen: true,
  abandonedAt: null,
};

function storeWith(targets: RenderTarget[]): OperatorStore {
  return {
    renderTargets: vi.fn().mockResolvedValue(targets),
  } as unknown as OperatorStore;
}

describe('renderSignals', () => {
  it('reports a failed render an operator can still requeue', async () => {
    const signals = await renderSignals(storeWith([target]), now);

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      `social-queue:render/${target.localizationId}`,
    );
  });

  it.each([
    ['a superseded visual version', { visualVersion: 'v3' }],
    ['an incomplete visual', { visualStatus: 'failed' }],
    ['an abandoned episode', { abandonedAt: '2026-09-05T11:34:35Z' }],
    ['a render that succeeded', { renderStatus: 'completed' }],
  ])('stays silent about %s', async (_case, override) => {
    const signals = await renderSignals(
      storeWith([{ ...target, ...override }]),
      now,
    );

    expect(signals).toEqual([]);
  });

  it('tolerates a store that predates the abandonment column', async () => {
    const legacy = { ...target };
    delete legacy.abandonedAt;

    expect(await renderSignals(storeWith([legacy]), now)).toHaveLength(1);
  });
});
