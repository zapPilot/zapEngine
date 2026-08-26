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

describe('Rednote account snapshot final URL fence', () => {
  it('rejects a follower count when the page redirects to login after the label appears', async () => {
    const urls = [
      'https://creator.rednote.com/new/home',
      'https://creator.rednote.com/login?from=home',
    ];
    const body = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      innerText: vi.fn().mockResolvedValue('首页\n粉丝\n1,234'),
    };
    const follower = {
      waitFor: vi.fn().mockResolvedValue(undefined),
      innerText: vi.fn().mockResolvedValue('粉丝'),
    };
    const browser = {
      withPage: (async (
        _profile: string,
        _url: string,
        run: (page: unknown) => Promise<unknown>,
      ) =>
        run({
          url: vi.fn(() => urls.shift() ?? urls.at(-1) ?? ''),
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
    expect(body.innerText).not.toHaveBeenCalled();
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).toContain(
      'Rednote session expired',
    );
  });
});
