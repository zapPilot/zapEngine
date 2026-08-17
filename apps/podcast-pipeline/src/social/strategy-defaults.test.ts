import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateSocialStrategy: vi.fn(),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
}));

vi.mock('./daemon-store.js', () => ({
  activateSocialStrategy: mocks.activateSocialStrategy,
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
});
