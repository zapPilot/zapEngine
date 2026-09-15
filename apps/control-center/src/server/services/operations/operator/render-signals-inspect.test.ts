import { describe, expect, it, vi } from 'vitest';

import { inspectRender } from './render-signals.js';
import type { OperatorStore, RenderTarget } from './store.js';

const NOW = new Date('2026-09-11T12:00:00.000Z');

const TARGET: RenderTarget = {
  episodeId: '11111111-1111-4111-8111-111111111111',
  localizationId: '22222222-2222-4222-8222-222222222222',
  renderStatus: 'failed',
  renderCompletedAt: null,
  renderLeaseExpiresAt: null,
  visualStatus: 'completed',
  visualVersion: 'current',
  deploymentOpen: true,
  abandonedAt: null,
};

function store(targets: RenderTarget[]): OperatorStore {
  return {
    renderTargets: vi.fn().mockResolvedValue(targets),
  } as unknown as OperatorStore;
}

describe('inspectRender', () => {
  it('reports the exact render target when it exists', async () => {
    const result = await inspectRender(
      store([TARGET]),
      `social-queue:render/${TARGET.localizationId}`,
      NOW,
    );

    expect(result).toMatchObject({
      fingerprint: `social-queue:render/${TARGET.localizationId}`,
      source: 'social-queue',
      status: 'ok',
      summary: 'Render status: failed',
    });
    expect(result.evidence).toMatchObject({
      localizationId: TARGET.localizationId,
    });
  });

  it('reports not-found when the exact localization is unavailable', async () => {
    const result = await inspectRender(
      store([TARGET]),
      'social-queue:render/33333333-3333-4333-8333-333333333333',
      NOW,
    );

    expect(result).toMatchObject({
      source: 'social-queue',
      status: 'not-found',
      summary: 'Exact render job is unavailable.',
    });
    expect(result.evidence).toEqual({});
  });
});
