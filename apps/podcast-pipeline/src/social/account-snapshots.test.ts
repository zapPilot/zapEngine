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
  isRednoteLoginSnippet,
  isRednoteLoginUrl,
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

function followerLocator(text: string, selector: string) {
  const target = selector === 'text=粉丝' ? '粉丝' : '粉絲';
  const succeed = text.includes(target);
  const node = {
    waitFor: succeed
      ? vi.fn().mockResolvedValue(undefined)
      : vi
          .fn()
          .mockRejectedValue(
            new Error('TimeoutError: locator.waitFor timeout'),
          ),
    innerText: vi.fn().mockResolvedValue(text),
  };
  return { ...node, first: () => node };
}

function browserSession(input: {
  rednoteText?: string;
  rednoteUrl?: string;
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
      const rednoteText = input.rednoteText ?? REDNOTE_HOME_TEXT;
      const rednoteUrl =
        input.rednoteUrl ?? 'https://creator.rednote.com/new/home';
      const isRednote = url.includes('creator.rednote.com');
      return run({
        url: () => (isRednote ? rednoteUrl : url),
        locator: (selector: string) => {
          if (selector === 'body') return locator(rednoteText);
          if (selector === 'text=粉丝' || selector === 'text=粉絲') {
            return followerLocator(rednoteText, selector);
          }
          return locator(input.xFollowersText ?? '8,096 Followers');
        },
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
    ['粉丝\n0', 0],
    ['粉丝 0', 0],
  ])('reads %s as %s', (text, expected) => {
    expect(parseFollowerCountNear(text, '粉丝')).toBe(expected);
  });
});

describe('isRednoteLoginUrl', () => {
  it.each([
    ['https://creator.rednote.com/new/home', false],
    ['https://creator.rednote.com/login', true],
    ['https://www.xiaohongshu.com/passport/login', true],
    ['https://creator.rednote.com/new/home?signin=1', true],
    ['https://creator.rednote.com/new/data', false],
  ])('classifies %s as %s', (url, expected) => {
    expect(isRednoteLoginUrl(url)).toBe(expected);
  });
});

describe('isRednoteLoginSnippet', () => {
  it.each([
    ['扫码登录', true],
    ['请登录后查看', true],
    ['请使用手机扫码登录 二维码', true],
    ['登录已过期 请重新登录', true],
    ['登录后查看完整数据', true],
    ['首页\n粉丝\n1,234', false],
    ['作品管理\n数据概览', false],
  ])('classifies snippet %s as %s', (snippet, expected) => {
    expect(isRednoteLoginSnippet(snippet)).toBe(expected);
  });

  it('normalizes traditional to simplified before matching', () => {
    expect(isRednoteLoginSnippet('掃碼登錄')).toBe(true);
    expect(isRednoteLoginSnippet('請登錄')).toBe(true);
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

  it('reads a zero follower count without treating it as missing', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({ rednoteText: '粉丝\n0' }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
    });
    expect(
      insert.mock.calls.some(
        ([s]) => s.platform === 'rednote' && s.followers === 0,
      ),
    ).toBe(true);
  });

  it('handles the Traditional 粉絲 label via the same follower wait', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({ rednoteText: '首頁\n粉絲\n2,345' }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
    });
    expect(
      insert.mock.calls.some(
        ([s]) => s.platform === 'rednote' && s.followers === 2345,
      ),
    ).toBe(true);
  });

  it('fails with session expired when the creator home redirects to a login URL', async () => {
    const log = vi.fn();
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({
        rednoteUrl: 'https://creator.rednote.com/login?from=home',
        rednoteText: '扫码登录',
      }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue(undefined),
      log,
    });
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Rednote session expired'),
      ]),
    );
    expect(log.mock.calls.map(([line]) => String(line)).join('\n')).not.toMatch(
      /exposed no follower count/,
    );
  });

  it('fails with session expired when the body is a login page even though the URL has not changed', async () => {
    const log = vi.fn();
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({
        rednoteText: '请登录\n扫码登录\n二维码已过期',
      }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue(undefined),
      log,
    });
    const joined = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(joined).toEqual(expect.stringContaining('Rednote session expired'));
  });

  it('reports a missing follower label with url and snippet for non-login pages (SPA not yet hydrated or layout moved)', async () => {
    const log = vi.fn();
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({
        rednoteText: '首页\n作品管理\n数据概览\n暂无数据',
      }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue(undefined),
      log,
    });
    const rednoteLine =
      log.mock.calls
        .map(([line]) => String(line))
        .find((line) => line.includes('rednote failed')) ?? '';
    expect(rednoteLine).toEqual(
      expect.stringContaining('exposed no follower count'),
    );
    expect(rednoteLine).toEqual(
      expect.stringContaining('url=https://creator.rednote.com/new/home'),
    );
    expect(rednoteLine).toEqual(expect.stringContaining('snippet='));
  });

  it('keeps the SPA race from being reported as a missing count when the label arrives within the wait window', async () => {
    // The mock models the critical difference vs the old body-only wait:
    // follower locator succeeds only when 粉丝 is present. A body that
    // already contains 粉丝 therefore passes the new wait gate without
    // needing an extra retry, whereas the old code would have read whatever
    // body happened to be there at T=0.
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({ rednoteText: '粉丝\n99' }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
    });
    expect(
      insert.mock.calls.some(
        ([s]) => s.platform === 'rednote' && s.followers === 99,
      ),
    ).toBe(true);
  });
});
