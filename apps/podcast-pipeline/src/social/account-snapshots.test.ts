import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPublishState: vi.fn(),
  assertThreadsSessionReady: vi.fn(),
}));

vi.mock('./state.js', () => ({ readPublishState: mocks.readPublishState }));
vi.mock('./threads-auth.js', () => ({
  assertThreadsSessionReady: mocks.assertThreadsSessionReady,
}));

import {
  captureDueAccountSnapshots,
  parseFollowerCountNear,
} from './account-snapshots.js';
import type { MetricsBrowserSession } from './metric-collectors.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const X_PROFILE = 'https://x.com/zap_pilot';
const REDNOTE_HOME_TEXT = '首页\n粉丝\n1,234\n获赞\n5.6万';

function locator(text: string) {
  const node = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn().mockResolvedValue(text),
  };
  return { ...node, first: () => node };
}

function browserSession(input: {
  rednoteText?: string;
  xFollowersText?: string;
  failFor?: string;
}): MetricsBrowserSession {
  return {
    withPage: (async (
      _profile: string,
      url: string,
      run: (page: unknown) => Promise<unknown>,
    ) => {
      if (input.failFor && url.includes(input.failFor)) {
        throw new Error(`browser profile is logged out (${url})`);
      }
      return run({
        locator: (selector: string) =>
          selector === 'body'
            ? locator(input.rednoteText ?? REDNOTE_HOME_TEXT)
            : locator(input.xFollowersText ?? '8,096 Followers'),
      });
    }) as MetricsBrowserSession['withPage'],
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function threadsInsights(followers: number | null) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data:
        followers === null
          ? []
          : [{ name: 'followers_count', total_value: { value: followers } }],
    }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readPublishState.mockResolvedValue({
    'episode-1': {
      zh: { x: { published: true, url: `${X_PROFILE}/status/1` } },
    },
  });
  mocks.assertThreadsSessionReady.mockResolvedValue({
    session: { accessToken: 'token' },
    profile: { id: 'threads-user', username: 'zap' },
  });
});

describe('parseFollowerCountNear', () => {
  it.each([
    ['粉丝\n1,234', 1234],
    ['1.2万 粉丝', 12000],
    ['1,234\n粉丝', 1234],
    ['获赞 5000', null],
  ])('reads %s as %s', (text, expected) => {
    expect(parseFollowerCountNear(text, '粉丝')).toBe(expected);
  });
});

describe('captureDueAccountSnapshots', () => {
  it('captures every collectable platform when nothing was recorded yet', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        browser: browserSession({}),
        fetchImpl: threadsInsights(310),
        latest: vi.fn().mockResolvedValue({}),
        insert,
      }),
    ).resolves.toBe(3);

    expect(insert.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      { platform: 'rednote', followers: 1234, details: { label: '粉丝' } },
      { platform: 'x', followers: 8096, details: { profileUrl: X_PROFILE } },
      { platform: 'threads', followers: 310, details: {} },
    ]);
  });

  // YouTube's publish scope is upload-only, so no credential here can read
  // channel statistics; per-post subscribersGained covers it instead.
  it('never claims a YouTube follower count', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({}),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
    });
    expect(
      insert.mock.calls.some(([snapshot]) => snapshot.platform === 'youtube'),
    ).toBe(false);
  });

  it('skips a platform recorded within the day and takes the stale one', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const snapshot = (platform: string, capturedAt: string) => ({
      id: `snapshot-${platform}`,
      platform,
      captured_at: capturedAt,
      followers: 1,
      details: {},
    });

    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({}),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({
        rednote: snapshot('rednote', '2026-08-20T06:00:00.000Z'),
        x: snapshot('x', '2026-08-18T06:00:00.000Z'),
        threads: snapshot('threads', 'not-a-date'),
      }),
      insert,
    });

    expect(insert.mock.calls.map(([row]) => row.platform)).toEqual([
      'x',
      'threads',
    ]);
  });

  it('keeps one platform failure from costing the others their snapshot', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        browser: browserSession({ failFor: 'creator.rednote.com' }),
        fetchImpl: threadsInsights(310),
        latest: vi.fn().mockResolvedValue({}),
        insert,
        log,
      }),
    ).resolves.toBe(2);

    expect(insert.mock.calls.map(([row]) => row.platform)).toEqual([
      'x',
      'threads',
    ]);
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('account snapshot rednote failed'),
      ]),
    );
  });

  it('records nothing when a page or API exposes no readable count', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        browser: browserSession({
          rednoteText: '首页\n作品管理',
          xFollowersText: 'Followers',
        }),
        fetchImpl: threadsInsights(null),
        latest: vi.fn().mockResolvedValue({}),
        insert,
        log,
      }),
    ).resolves.toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('reports a missing X profile instead of guessing one', async () => {
    mocks.readPublishState.mockResolvedValue({});
    const log = vi.fn();

    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({}),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue(undefined),
      log,
    });

    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('publisher profile URL is unknown'),
      ]),
    );
  });
});
