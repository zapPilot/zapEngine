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

async function captureAuthenticatedRednote(rednoteText: string) {
  const body = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn().mockResolvedValue(rednoteText),
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
  const captured = await captureDueAccountSnapshots({
    now: NOW,
    browser,
    latest: vi.fn().mockResolvedValue({
      x: recentSnapshot('x'),
      threads: recentSnapshot('threads'),
    }),
    insert,
    log,
  });
  return { captured, insert, log };
}

function expectValidFollowerSnapshot(
  input: Awaited<ReturnType<typeof captureAuthenticatedRednote>>,
) {
  expect(input.captured).toBe(1);
  expect(input.insert).toHaveBeenCalledTimes(1);
  expect(input.insert).toHaveBeenCalledWith({
    platform: 'rednote',
    followers: 1234,
    details: { label: '粉丝' },
  });
  expect(
    input.log.mock.calls.map(([line]) => String(line)).join('\n'),
  ).not.toContain('Rednote session expired');
}

describe('Rednote authenticated login-copy boundary', () => {
  it('keeps a valid follower snapshot when authenticated UI mentions login settings', async () => {
    expectValidFollowerSnapshot(
      await captureAuthenticatedRednote(
        '首页\n粉丝\n1,234\n账号与安全\n登录设备管理',
      ),
    );
  });

  it('keeps a valid follower snapshot when help copy asks the user to log in elsewhere', async () => {
    expectValidFollowerSnapshot(
      await captureAuthenticatedRednote(
        '首页\n粉丝\n1,234\n帮助中心\n如需管理其他账号，请登录对应账号后操作',
      ),
    );
  });
});
