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
  readRednoteFollowerCount,
} from './account-snapshots.js';
import type { MetricsBrowserSession } from './metric-collectors.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const X_PROFILE = 'https://x.com/zap_pilot';
const REDNOTE_HOME_URL = 'https://creator.rednote.com/new/home';
const REDNOTE_HOME_TEXT = '首页\n粉丝\n1,234\n获赞\n5.6万';

/** Indexing is clamped to the last entry, so a fixture sequence is never empty. */
function at<T>(items: readonly T[], index: number): T {
  const value = items[Math.min(index, items.length - 1)];
  if (value === undefined) throw new Error('empty fixture sequence');
  return value;
}

function locator(text: string) {
  const node = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn().mockResolvedValue(text),
  };
  return { ...node, first: () => node };
}

/**
 * Successive reads model SPA hydration: the shell answers first and the last
 * entry is what the page settles on. A single string is a page that never
 * changes.
 */
function sequenceLocator(texts: readonly string[]) {
  let reads = 0;
  const node = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn(async () => at(texts, reads++)),
  };
  return { ...node, first: () => node };
}

function browserSession(input: {
  rednoteText?: string | readonly string[];
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
      const rednoteTexts =
        typeof rednoteText === 'string' ? [rednoteText] : rednoteText;
      const rednoteUrl = input.rednoteUrl ?? REDNOTE_HOME_URL;
      const isRednote = url.includes('creator.rednote.com');
      return run({
        url: () => (isRednote ? rednoteUrl : url),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        locator: (selector: string) => {
          if (selector === 'body') return sequenceLocator(rednoteTexts);
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

/**
 * Drives the poll off an injected clock so a deadline is reached without any
 * real elapsed time.
 */
function follower(input: {
  texts: readonly (string | Error)[];
  urls?: readonly string[];
  timeoutMs?: number;
}) {
  let clock = 0;
  let reads = 0;
  let urlReads = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const urls = input.urls ?? [REDNOTE_HOME_URL];
  const read = () => {
    const next = at(input.texts, reads++);
    if (next instanceof Error) throw next;
    return next;
  };
  return {
    sleep,
    run: () =>
      readRednoteFollowerCount({
        readText: async () => read(),
        readUrl: () => at(urls, urlReads++),
        sleep,
        now: () => clock,
        timeoutMs: input.timeoutMs ?? 15_000,
      }),
  };
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
    ['粉丝\n--', null],
    ['首页\n粉丝\n--', null],
  ])('reads %s as %s', (text, expected) => {
    expect(parseFollowerCountNear(text, '粉丝')).toBe(expected);
  });
});

describe('isRednoteLoginUrl', () => {
  it.each([
    ['https://creator.rednote.com/new/home', false],
    ['https://creator.rednote.com/login', true],
    ['https://www.xiaohongshu.com/passport/login', true],
    ['https://creator.rednote.com/new/auth', true],
    ['https://creator.rednote.com/new/data', false],
    // Path segments are compared by equality, so a creator page whose path
    // merely contains "auth" is not an expired session.
    ['https://creator.rednote.com/author/123', false],
    // Query strings are no longer consulted: a login modal that leaves the path
    // alone is caught by the body snippet check on every poll iteration.
    ['https://creator.rednote.com/new/home?signin=1', false],
    ['not-a-url', false],
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

describe('readRednoteFollowerCount', () => {
  // The regression this whole collector exists for: the label ships in the
  // shell next to a placeholder and only the number hydrates from a later API
  // response, so waiting for the label and reading once still reads nothing.
  it('waits through a hydrating placeholder for the number itself', async () => {
    const poll = follower({
      texts: ['首页\n粉丝\n--', '首页\n粉丝\n--', '首页\n粉丝\n1,234'],
    });
    await expect(poll.run()).resolves.toBe(1234);
    expect(poll.sleep).toHaveBeenCalledTimes(2);
  });

  // Traditional pages need no separate selector: the text is normalized to
  // zh-CN before parsing, so 粉絲 and 粉丝 share one wait.
  it('reads a late Traditional 粉絲 count through the same poll', async () => {
    const poll = follower({ texts: ['首頁\n粉絲\n--', '首頁\n粉絲\n2,345'] });
    await expect(poll.run()).resolves.toBe(2345);
  });

  it('returns a zero count instead of polling on', async () => {
    const poll = follower({ texts: ['粉丝\n0'] });
    await expect(poll.run()).resolves.toBe(0);
    expect(poll.sleep).not.toHaveBeenCalled();
  });

  it('reports session expiry when the body turns into a login page mid-poll', async () => {
    const poll = follower({ texts: ['首页\n作品管理', '扫码登录'] });
    await expect(poll.run()).rejects.toThrow(/Rednote session expired/);
  });

  it('reports session expiry when the page redirects to login mid-poll', async () => {
    const poll = follower({
      texts: ['首页\n作品管理', '首页'],
      urls: [REDNOTE_HOME_URL, 'https://creator.rednote.com/login?from=home'],
    });
    await expect(poll.run()).rejects.toThrow(/redirected to login/);
  });

  it('keeps a real count that shares the page with an incidental 登录 string', async () => {
    const poll = follower({ texts: ['粉丝\n1,234\n请登录以继续'] });
    await expect(poll.run()).resolves.toBe(1234);
  });

  it('re-reads after a body read fails mid-navigation', async () => {
    const poll = follower({
      texts: [new Error('Execution context was destroyed'), '粉丝\n777'],
    });
    await expect(poll.run()).resolves.toBe(777);
  });

  it('honors the deadline and reports url plus snippet when nothing hydrates', async () => {
    const poll = follower({
      texts: ['首页\n作品管理\n数据概览'],
      timeoutMs: 2_000,
    });
    await expect(poll.run()).rejects.toThrow(
      /exposed no follower count \(url=https:\/\/creator\.rednote\.com\/new\/home snippet="首页 作品管理 数据概览"\)/,
    );
    // 2000ms budget at a 500ms interval: bounded, not spun.
    expect(poll.sleep).toHaveBeenCalledTimes(4);
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
        followerWaitMs: 0,
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

  it('handles the Traditional 粉絲 label through zh-CN normalization', async () => {
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

  it('reports a missing follower count with url and snippet when the layout moved', async () => {
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
      followerWaitMs: 0,
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

  it('keeps the SPA race from being reported as a missing count', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      browser: browserSession({
        // The label is in the shell from the first paint; only the number
        // arrives with the stats API response.
        rednoteText: ['首页\n粉丝\n--', '首页\n粉丝\n99'],
      }),
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
