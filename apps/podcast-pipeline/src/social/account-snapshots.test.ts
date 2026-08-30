import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPublishState: vi.fn(),
  assertThreadsSessionReady: vi.fn(),
  assertYouTubeSessionReady: vi.fn(),
}));

vi.mock('./state.js', () => ({ readPublishState: mocks.readPublishState }));
vi.mock('./threads-auth.js', () => ({
  assertThreadsSessionReady: mocks.assertThreadsSessionReady,
}));
vi.mock('./youtube-auth.js', () => ({
  assertYouTubeSessionReady: mocks.assertYouTubeSessionReady,
  YOUTUBE_READONLY_SCOPE: 'https://www.googleapis.com/auth/youtube.readonly',
}));

import {
  captureDueAccountSnapshots,
  capturePrePublishAccountSnapshots,
  extractRednoteFollowerText,
  parseRednoteUserId,
  xFollowerLinkSelector,
} from './account-snapshots.js';
import type { MetricsBrowserSession } from './metric-collectors.js';

const NOW = new Date('2026-08-20T12:00:00.000Z');
const YOUTUBE_SCOPE_MISSING = new Error(
  'YouTube session is missing scope https://www.googleapis.com/auth/youtube.readonly',
);
const X_PROFILE = 'https://x.com/zap_pilot';
const X_FOLLOWER_SELECTOR =
  'a[href="/zap_pilot/verified_followers"], a[href="/zap_pilot/followers"]';
const REDNOTE_USER_INFO_URL =
  'https://creator.rednote.com/api/galaxy/user/info';
const REDNOTE_USER_ID = '65e15da0000000000500e538';
const REDNOTE_PROFILE_URL = `https://www.rednote.com/user/profile/${REDNOTE_USER_ID}`;

/**
 * The shape the consumer profile page server-renders: one entry per counter,
 * the follower one identified by `type`, and the neighbouring `Likes & Saves`
 * figure that a label-relative text read could pick up instead.
 */
function rednoteProfileHtml(count: string): string {
  const interactions = [
    '{"type":"follows","name":"Following","count":"925","i18nCount":"925"}',
    `{"type":"fans","name":"Followers","count":"${count}","i18nCount":"${count}"}`,
    '{"type":"interaction","name":"Likes & Saves","count":"456","i18nCount":"456"}',
  ].join(',');
  return `<script>window.__INITIAL_STATE__={"user":{"userPageData":{"interactions":[${interactions}],"tags":[]}}}</script>`;
}

function apiResponse(input: {
  status?: number;
  json?: unknown;
  text?: string;
}) {
  const status = input.status ?? 200;
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => input.json,
    text: async () => input.text ?? '',
  };
}

function locator(text: string) {
  const node = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    innerText: vi.fn().mockResolvedValue(text),
  };
  return { ...node, first: () => node };
}

function browserSession(input: {
  rednoteUserInfoStatus?: number;
  rednoteProfileStatus?: number;
  rednoteFollowerCount?: string;
  rednoteProfileHtml?: string;
  xFollowersText?: string;
  failFor?: 'rednote' | 'x';
}): MetricsBrowserSession {
  return {
    withPage: (async (
      _profile: string,
      url: string,
      run: (page: unknown) => Promise<unknown>,
    ) => {
      if (input.failFor === 'x') {
        throw new Error(`browser profile is logged out (${url})`);
      }
      return run({
        locator: (selector: string) => {
          // Only the selector the collector is supposed to use answers: a
          // regression back to a suffix match on `/followers` must fail here
          // rather than silently read whatever the fixture returns.
          if (selector !== X_FOLLOWER_SELECTOR) {
            throw new Error(`unexpected X selector ${selector}`);
          }
          return locator(input.xFollowersText ?? '8,096 位跟隨者');
        },
      });
    }) as MetricsBrowserSession['withPage'],
    withRequest: (async (
      _profile: string,
      run: (request: unknown) => Promise<unknown>,
    ) => {
      if (input.failFor === 'rednote') {
        throw new Error('browser profile is logged out (rednote)');
      }
      return run({
        get: async (url: string) => {
          if (url === REDNOTE_USER_INFO_URL) {
            return apiResponse({
              status: input.rednoteUserInfoStatus,
              json: { data: { userId: REDNOTE_USER_ID } },
            });
          }
          if (url !== REDNOTE_PROFILE_URL) {
            throw new Error(`unexpected rednote request ${url}`);
          }
          return apiResponse({
            status: input.rednoteProfileStatus,
            text:
              input.rednoteProfileHtml ??
              rednoteProfileHtml(input.rednoteFollowerCount ?? '1234'),
          });
        },
      });
    }) as MetricsBrowserSession['withRequest'],
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

function rednoteLine(log: ReturnType<typeof vi.fn>): string {
  return (
    log.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('rednote')) ?? ''
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The operator has not re-consented to `youtube.readonly` yet, which is the
  // state every case below runs in unless it says otherwise.
  mocks.assertYouTubeSessionReady.mockRejectedValue(YOUTUBE_SCOPE_MISSING);
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

describe('extractRednoteFollowerText', () => {
  it('reads the fans entry rather than a neighbouring counter', () => {
    expect(extractRednoteFollowerText(rednoteProfileHtml('77'))).toBe('77');
  });

  // The page emits the same entry with its keys in either order between
  // renders, so the count is located inside the entry, not after the type.
  it('reads the fans entry when count precedes type', () => {
    const html =
      '{"count":"1.2万","i18nCount":"1.2万","type":"fans","name":"粉丝"}';
    expect(extractRednoteFollowerText(html)).toBe('1.2万');
  });

  it('returns the masked count a signed-out read renders', () => {
    expect(extractRednoteFollowerText(rednoteProfileHtml('10+'))).toBe('10+');
  });

  it('returns null when the page carries no fans entry at all', () => {
    expect(extractRednoteFollowerText('<html><body>登录</body></html>')).toBe(
      null,
    );
  });
});

describe('parseRednoteUserId', () => {
  it.each([
    [{ data: { userId: REDNOTE_USER_ID } }, REDNOTE_USER_ID],
    [{ data: { userId: ' padded ' } }, 'padded'],
    [{ data: { userId: '' } }, null],
    [{ data: {} }, null],
    [{ code: -1, msg: '登录已过期' }, null],
    [null, null],
  ])('reads %j as %s', (payload, expected) => {
    expect(parseRednoteUserId(payload)).toBe(expected);
  });
});

describe('xFollowerLinkSelector', () => {
  it('accepts both follower tabs, pinned to the publisher handle', () => {
    expect(xFollowerLinkSelector(X_PROFILE)).toBe(X_FOLLOWER_SELECTOR);
  });

  it('refuses a URL that carries no handle', () => {
    expect(() => xFollowerLinkSelector('https://x.com/')).toThrow(
      /no readable handle/,
    );
    expect(() => xFollowerLinkSelector('https://x.com/a/b')).toThrow(
      /no readable handle/,
    );
  });
});

describe('captureDueAccountSnapshots', () => {
  it('captures every collectable platform when nothing was recorded yet', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        openBrowser: () => browserSession({}),
        fetchImpl: threadsInsights(310),
        latest: vi.fn().mockResolvedValue({}),
        insert,
      }),
    ).resolves.toEqual(['rednote', 'x', 'threads']);

    expect(insert.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      {
        platform: 'rednote',
        followers: 1234,
        details: { profileUrl: REDNOTE_PROFILE_URL },
      },
      { platform: 'x', followers: 8096, details: { profileUrl: X_PROFILE } },
      { platform: 'threads', followers: 310, details: {} },
    ]);
  });

  it('opens no browser when nothing that needs one is due', async () => {
    const openBrowser = vi.fn(() => browserSession({}));
    const recent = (platform: string) => ({
      id: `snapshot-${platform}`,
      platform,
      followers: 1,
      details: {},
      captured_at: new Date(NOW.getTime() - 60_000).toISOString(),
    });

    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser,
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({
        rednote: recent('rednote'),
        x: recent('x'),
        threads: recent('threads'),
        youtube: recent('youtube'),
      }),
      insert: vi.fn(),
    });

    // Eight times a day is eight browser launches if this is not checked first.
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('skips a platform recorded within three hours and takes stale ones', async () => {
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
      openBrowser: () => browserSession({}),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({
        rednote: snapshot('rednote', '2026-08-20T10:00:00.000Z'),
        x: snapshot('x', '2026-08-20T06:00:00.000Z'),
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
        openBrowser: () => browserSession({ failFor: 'rednote' }),
        fetchImpl: threadsInsights(310),
        latest: vi.fn().mockResolvedValue({}),
        insert,
        log,
      }),
    ).resolves.toEqual(['x', 'threads']);

    expect(insert.mock.calls.map(([row]) => row.platform)).toEqual([
      'x',
      'threads',
    ]);
    expect(rednoteLine(log)).toEqual(
      expect.stringMatching(/rednote.*account snapshot failed/),
    );
  });

  it('records nothing when a page or API exposes no readable count', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        openBrowser: () =>
          browserSession({
            rednoteProfileHtml: '<html><body>Zap Pilot</body></html>',
            xFollowersText: '位跟隨者',
          }),
        fetchImpl: threadsInsights(null),
        latest: vi.fn().mockResolvedValue({}),
        insert,
        log,
      }),
    ).resolves.toEqual([]);
    expect(insert).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(3);
    expect(rednoteLine(log)).toEqual(
      expect.stringContaining(
        `Rednote profile ${REDNOTE_PROFILE_URL} exposed no follower count`,
      ),
    );
  });

  it('reports a missing X profile instead of guessing one', async () => {
    mocks.readPublishState.mockResolvedValue({});
    const log = vi.fn();

    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser: () => browserSession({}),
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
      openBrowser: () => browserSession({ rednoteFollowerCount: '0' }),
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

  it('reads a count the page abbreviates', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser: () => browserSession({ rednoteFollowerCount: '1.2万' }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
    });
    expect(
      insert.mock.calls.some(
        ([s]) => s.platform === 'rednote' && s.followers === 12_000,
      ),
    ).toBe(true);
  });

  it('reports an expired Rednote session instead of reading the profile page', async () => {
    const log = vi.fn();
    const insert = vi.fn().mockResolvedValue(undefined);

    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser: () => browserSession({ rednoteUserInfoStatus: 401 }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
      log,
    });

    expect(insert.mock.calls.some(([row]) => row.platform === 'rednote')).toBe(
      false,
    );
    expect(rednoteLine(log)).toEqual(
      expect.stringContaining('Rednote session expired'),
    );
  });

  // Signed out, the profile page still answers 200 and masks every counter as
  // `10+`. Recording that would read as an account that lost its followers.
  it('refuses the masked count a signed-out profile page renders', async () => {
    const log = vi.fn();
    const insert = vi.fn().mockResolvedValue(undefined);

    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser: () => browserSession({ rednoteFollowerCount: '10+' }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert,
      log,
    });

    expect(insert.mock.calls.some(([row]) => row.platform === 'rednote')).toBe(
      false,
    );
    expect(rednoteLine(log)).toEqual(
      expect.stringContaining('masked follower count ("10+")'),
    );
  });

  it('reports the HTTP status when the profile page itself fails', async () => {
    const log = vi.fn();
    await captureDueAccountSnapshots({
      now: NOW,
      openBrowser: () => browserSession({ rednoteProfileStatus: 503 }),
      fetchImpl: threadsInsights(310),
      latest: vi.fn().mockResolvedValue({}),
      insert: vi.fn().mockResolvedValue(undefined),
      log,
    });
    expect(rednoteLine(log)).toEqual(expect.stringContaining('HTTP 503'));
  });
});

describe('capturePrePublishAccountSnapshots', () => {
  it('opens no browser for unsupported or less-than-one-hour-old baselines', async () => {
    const openBrowser = vi.fn(() => browserSession({}));
    await expect(
      capturePrePublishAccountSnapshots({
        now: NOW,
        platforms: ['youtube', 'x'],
        openBrowser,
        latest: vi.fn().mockResolvedValue({
          x: {
            captured_at: new Date(NOW.getTime() - 59 * 60_000).toISOString(),
          },
        }),
        insert: vi.fn(),
      }),
    ).resolves.toEqual([]);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it('captures only stale due platforms and isolates failures', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await expect(
      capturePrePublishAccountSnapshots({
        now: NOW,
        platforms: ['rednote', 'x'],
        openBrowser: () => browserSession({ failFor: 'rednote' }),
        latest: vi.fn().mockResolvedValue({}),
        insert,
      }),
    ).resolves.toEqual(['x']);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'x', followers: 8096 }),
    );
  });
});
