import { describe, expect, it, vi } from 'vitest';

import { captureDueAccountSnapshots } from './account-snapshots.js';
import type { MetricsBrowserSession } from './metric-collectors.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function recentSnapshot(platform: 'x' | 'threads') {
  return {
    id: `snapshot-${platform}`,
    platform,
    captured_at: NOW.toISOString(),
    followers: 1,
    details: {},
  };
}

describe('Rednote account snapshot stale DOM fence', () => {
  it('rejects stale follower content when login UI is present in the same DOM', async () => {
    const body = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      innerText: vi
        .fn()
        .mockResolvedValue('首页\n粉丝\n1,234\n请登录后查看完整数据\n扫码登录'),
    };
    const follower = {
      waitFor: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      withPage: (async (
        _profile: string,
        _url: string,
        run: (page: unknown) => Promise<unknown>,
      ) =>
        run({
          url: vi.fn(() => 'https://creator.rednote.com/new/home'),
          locator: vi.fn((selector: string) => {
            if (selector === 'body') return body;
            return { ...follower, first: () => follower };
          }),
        })) as MetricsBrowserSession['withPage'],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const insert = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        browser,
        latest: vi.fn().mockResolvedValue({
          x: recentSnapshot('x'),
          threads: recentSnapshot('threads'),
        }),
        insert,
        log,
      }),
    ).resolves.toBe(0);

    expect(insert).not.toHaveBeenCalled();
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain(
      'Rednote session expired',
    );
  });
});
