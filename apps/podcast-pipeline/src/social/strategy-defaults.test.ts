import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateSocialStrategy: vi.fn(),
  deactivateSocialStrategy: vi.fn().mockResolvedValue(undefined),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
}));

vi.mock('./daemon-store.js', () => ({
  activateSocialStrategy: mocks.activateSocialStrategy,
  deactivateSocialStrategy: mocks.deactivateSocialStrategy,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
}));

import { refreshSocialStrategies } from './strategy.js';

describe('social strategy default wiring', () => {
  it('uses the no-op logger when refresh is called without one', async () => {
    const now = new Date('2026-08-17T00:00:00.000Z');

    await expect(refreshSocialStrategies({ now })).resolves.toBeUndefined();

    expect(mocks.listLearningSocialPosts).toHaveBeenCalledWith(
      '2026-06-18T00:00:00.000Z',
    );
    expect(mocks.listLearningSocialMetrics).toHaveBeenCalledWith(
      '2026-06-18T00:00:00.000Z',
    );
    expect(mocks.activateSocialStrategy).not.toHaveBeenCalled();
  });

  it('executes the no-op logger while retiring an obsolete lane', async () => {
    mocks.getActiveSocialStrategies.mockResolvedValueOnce([
      {
        id: 'legacy-x-en',
        platform: 'x',
        language_code: 'en',
        version: 1,
        config: {},
        based_on_samples: 0,
        active: true,
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ]);

    await expect(
      refreshSocialStrategies({ now: new Date('2026-09-29T00:00:00.000Z') }),
    ).resolves.toBeUndefined();

    expect(mocks.deactivateSocialStrategy).toHaveBeenCalledWith('legacy-x-en');
  });
});
