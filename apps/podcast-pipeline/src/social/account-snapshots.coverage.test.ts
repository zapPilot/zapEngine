import type { APIRequestContext, APIResponse } from 'playwright-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latest: vi.fn().mockResolvedValue({}),
  insert: vi.fn().mockResolvedValue(undefined),
  readPublishState: vi.fn().mockResolvedValue({}),
  assertThreadsSessionReady: vi.fn().mockResolvedValue({
    session: { accessToken: 'threads-token' },
    profile: { id: 'threads-user', username: 'zap' },
  }),
}));

vi.mock('./daemon-store.js', () => ({
  latestSocialAccountSnapshots: mocks.latest,
  insertSocialAccountSnapshot: mocks.insert,
}));
vi.mock('./state.js', () => ({ readPublishState: mocks.readPublishState }));
vi.mock('./threads-auth.js', () => ({
  assertThreadsSessionReady: mocks.assertThreadsSessionReady,
}));

import {
  captureDueAccountSnapshots,
  capturePrePublishAccountSnapshots,
  extractRednoteFollowerText,
} from './account-snapshots.js';
import type { MetricsBrowserSession } from './metric-collectors.js';

const NOW = new Date('2026-09-29T00:00:00.000Z');
const USER_INFO_URL = 'https://creator.rednote.com/api/galaxy/user/info';

function response(
  status: number,
  payload: unknown,
  rejectJson = false,
): APIResponse {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: rejectJson
      ? () => Promise.reject(new Error('invalid json'))
      : async () => payload,
    text: async () => '',
  } as unknown as APIResponse;
}

function rednoteJsonFailureSession(): MetricsBrowserSession {
  return {
    withRequest: async (_profile, run) =>
      run({
        get: async (url: string) => {
          if (url !== USER_INFO_URL) throw new Error(`unexpected ${url}`);
          return response(200, null, true);
        },
      } as unknown as APIRequestContext),
    withPage: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function threadsFetch(input: {
  status?: number;
  payload?: unknown;
  rejectJson?: boolean;
}): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: (input.status ?? 200) >= 200 && (input.status ?? 200) < 300,
    status: input.status ?? 200,
    json: input.rejectJson
      ? () => Promise.reject(new Error('bad json'))
      : async () => input.payload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.latest.mockResolvedValue({});
  mocks.insert.mockResolvedValue(undefined);
  mocks.readPublishState.mockResolvedValue({});
  mocks.assertThreadsSessionReady.mockResolvedValue({
    session: { accessToken: 'threads-token' },
    profile: { id: 'threads-user', username: 'zap' },
  });
});

describe('account snapshot coverage edges', () => {
  it('returns null when a fans entry carries no count field', () => {
    expect(
      extractRednoteFollowerText('{"type":"fans","name":"Followers"}'),
    ).toBeNull();
  });

  it('treats malformed Rednote user-info JSON as a missing id and isolates the collector failure', async () => {
    const log = vi.fn();
    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        openBrowser: rednoteJsonFailureSession,
        fetchImpl: threadsFetch({
          payload: {
            data: [{ name: 'followers_count', total_value: { value: 3 } }],
          },
        }),
        latest: vi.fn().mockResolvedValue({
          x: { captured_at: NOW.toISOString() },
        }),
        insert: vi.fn(),
        log,
      }),
    ).resolves.toEqual(['threads']);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Rednote creator user info exposed no user id'),
    );
  });

  it.each([
    [
      'HTTP failure plus malformed JSON',
      threadsFetch({ status: 503, rejectJson: true }),
      /HTTP 503/,
    ],
    [
      'non-record payload',
      threadsFetch({ payload: null }),
      /no followers_count/,
    ],
    [
      'non-array data',
      threadsFetch({ payload: { data: {} } }),
      /no followers_count/,
    ],
    [
      'invalid entries and non-finite values',
      threadsFetch({
        payload: {
          data: [
            null,
            { name: 'likes', total_value: { value: 1 } },
            {
              name: 'followers_count',
              total_value: { value: Number.POSITIVE_INFINITY },
            },
          ],
        },
      }),
      /no followers_count/,
    ],
  ])('isolates Threads %s', async (_name, fetchImpl, expected) => {
    const log = vi.fn();
    await expect(
      capturePrePublishAccountSnapshots({
        now: NOW,
        platforms: ['threads'],
        openBrowser: () => {
          throw new Error('browser must stay lazy');
        },
        fetchImpl,
        latest: vi.fn().mockResolvedValue({}),
        insert: vi.fn(),
        log,
      }),
    ).resolves.toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(expected));
  });

  it('uses the default latest/insert/fetch wiring for a due Threads baseline', async () => {
    const globalFetch = threadsFetch({
      payload: {
        data: [{ name: 'followers_count', total_value: { value: 12 } }],
      },
    });
    vi.stubGlobal('fetch', globalFetch);
    try {
      await expect(
        capturePrePublishAccountSnapshots({
          now: NOW,
          platforms: ['threads'],
          openBrowser: () => {
            throw new Error('browser must stay lazy');
          },
        }),
      ).resolves.toEqual(['threads']);

      expect(mocks.latest).toHaveBeenCalledOnce();
      expect(mocks.insert).toHaveBeenCalledWith({
        platform: 'threads',
        followers: 12,
        details: {},
      });
      expect(globalFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses default due-snapshot store dependencies and honors closeBrowser=false without opening a browser', async () => {
    const recent = { captured_at: NOW.toISOString() };
    mocks.latest.mockResolvedValueOnce({
      rednote: recent,
      x: recent,
      threads: recent,
    });
    const openBrowser = vi.fn(() => rednoteJsonFailureSession());

    await expect(
      captureDueAccountSnapshots({
        now: NOW,
        openBrowser,
        closeBrowser: false,
      }),
    ).resolves.toEqual([]);

    expect(mocks.latest).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
