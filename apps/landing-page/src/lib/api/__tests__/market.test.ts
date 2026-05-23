import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRegimeStrip } from '../market';

type MockResponse = { ok: boolean; json: object; status?: number };
type MockEntry = MockResponse | 'reject';

const REGIME_PATH = '/api/v2/market/regime/history';
const SENTIMENT_PATH = '/api/v2/market/sentiment';
const DASHBOARD_PATH = '/api/v2/market/dashboard';

function mockFetchByUrl(
  responses: Record<string, MockEntry[]>,
): ReturnType<typeof vi.fn> {
  const callsByPath: Record<string, number> = {};
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    const matchKey = Object.keys(responses).find((k) => path.startsWith(k));
    if (matchKey === undefined) {
      return Promise.reject(new Error(`unmocked url: ${url}`));
    }
    const list = responses[matchKey]!;
    const index = callsByPath[matchKey] ?? 0;
    callsByPath[matchKey] = index + 1;
    const res = list[Math.min(index, list.length - 1)] ?? 'reject';
    if (res === 'reject') return Promise.reject(new Error('network error'));
    return Promise.resolve({
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: () => Promise.resolve(res.json),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const REGIME_RESPONSE = { current: { regime_id: 'f' } };
const SENTIMENT_RESPONSE = { value: 42, status: 'Fear' };
const DASHBOARD_RESPONSE = {
  snapshots: [
    {
      values: {
        btc: { value: 70000, indicators: { dma_200: { value: 60000 } } },
      },
    },
  ],
};

const REGIME_ITEM = {
  label: 'Regime',
  value: 'Fear',
  detail: 'Accumulation zone',
};
const SENTIMENT_ITEM = {
  label: 'FGI',
  value: '42',
  detail: 'Fear zone',
};
const DASHBOARD_ITEM = {
  label: '200MA Δ',
  value: '+16.7%',
  detail: 'Above trend',
};

describe('fetchRegimeStrip', () => {
  const originalUrl = process.env['NEXT_PUBLIC_ANALYTICS_API_URL'];

  beforeEach(() => {
    process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] = 'http://analytics.test';
  });

  afterEach(() => {
    if (originalUrl === undefined)
      delete process.env['NEXT_PUBLIC_ANALYTICS_API_URL'];
    else process.env['NEXT_PUBLIC_ANALYTICS_API_URL'] = originalUrl;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns null when NEXT_PUBLIC_ANALYTICS_API_URL is unset', async () => {
    delete process.env['NEXT_PUBLIC_ANALYTICS_API_URL'];
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('returns all three items when every endpoint succeeds', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({
      items: [REGIME_ITEM, SENTIMENT_ITEM, DASHBOARD_ITEM],
    });
  });

  it('omits regime item when regime endpoint fails persistently', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: ['reject'],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [SENTIMENT_ITEM, DASHBOARD_ITEM] });
  });

  it('omits sentiment item when sentiment endpoint fails persistently', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: ['reject'],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [REGIME_ITEM, DASHBOARD_ITEM] });
  });

  it('omits dashboard item when dashboard endpoint fails persistently', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: ['reject'],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [REGIME_ITEM, SENTIMENT_ITEM] });
  });

  it('omits the failing item when a response is non-ok 5xx', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: false, json: {}, status: 500 }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [REGIME_ITEM, DASHBOARD_ITEM] });
  });

  it('omits regime item when regime id is unknown', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [
        { ok: true, json: { current: { regime_id: 'unknown_regime_xyz' } } },
      ],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [SENTIMENT_ITEM, DASHBOARD_ITEM] });
  });

  it('omits sentiment item when sentiment value is not finite', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: true, json: { value: NaN, status: 'Bad' } }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [REGIME_ITEM, DASHBOARD_ITEM] });
  });

  it('omits dashboard item when dashboard has no usable BTC 200MA delta', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [
        {
          ok: true,
          json: {
            snapshots: [
              {
                values: {
                  btc: {
                    value: 70_000,
                    indicators: {},
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [REGIME_ITEM, SENTIMENT_ITEM] });
  });

  it('returns null when all three endpoints fail', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: ['reject'],
      [SENTIMENT_PATH]: ['reject'],
      [DASHBOARD_PATH]: ['reject'],
    });

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('omits regime item when regime current has no regime_id or to_regime', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: { current: {} } }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [SENTIMENT_ITEM, DASHBOARD_ITEM] });
  });

  it('uses to_regime fallback when regime_id is absent', async () => {
    mockFetchByUrl({
      [REGIME_PATH]: [{ ok: true, json: { current: { to_regime: 'g' } } }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result?.items[0]).toEqual({
      label: 'Regime',
      value: 'Greed',
      detail: 'Risk-on legs active',
    });
  });

  it('retries transient failures and returns full data when retry succeeds', async () => {
    const fetchMock = mockFetchByUrl({
      [REGIME_PATH]: ['reject', { ok: true, json: REGIME_RESPONSE }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({
      items: [REGIME_ITEM, SENTIMENT_ITEM, DASHBOARD_ITEM],
    });
    const regimeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes(REGIME_PATH),
    );
    expect(regimeCalls).toHaveLength(2);
  });

  it('falls back to partial result when retry budget is exhausted', async () => {
    const fetchMock = mockFetchByUrl({
      [REGIME_PATH]: ['reject', 'reject', 'reject'],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [SENTIMENT_ITEM, DASHBOARD_ITEM] });
    const regimeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes(REGIME_PATH),
    );
    expect(regimeCalls).toHaveLength(3);
  });

  it('does not retry on 4xx responses', async () => {
    const fetchMock = mockFetchByUrl({
      [REGIME_PATH]: [{ ok: false, json: {}, status: 400 }],
      [SENTIMENT_PATH]: [{ ok: true, json: SENTIMENT_RESPONSE }],
      [DASHBOARD_PATH]: [{ ok: true, json: DASHBOARD_RESPONSE }],
    });

    const result = await fetchRegimeStrip();

    expect(result).toEqual({ items: [SENTIMENT_ITEM, DASHBOARD_ITEM] });
    const regimeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes(REGIME_PATH),
    );
    expect(regimeCalls).toHaveLength(1);
  });
});
