import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRegimeStrip } from '../market';

function mockFetch(responses: Array<{ ok: boolean; json: object } | 'reject'>) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const res = responses[call++] ?? 'reject';
      if (res === 'reject') return Promise.reject(new Error('network error'));
      return Promise.resolve({
        ok: res.ok,
        json: () => Promise.resolve(res.json),
      });
    }),
  );
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

  it('returns populated items when all three endpoints succeed', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      { ok: true, json: SENTIMENT_RESPONSE },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toEqual({
      items: [
        {
          label: 'Regime',
          value: 'Fear',
          detail: 'Accumulation zone',
        },
        {
          label: 'FGI',
          value: '42',
          detail: 'Fear zone',
        },
        {
          label: '200MA Δ',
          value: '+16.7%',
          detail: 'Above trend',
        },
      ],
    });
  });

  it('returns null when the regime endpoint fails', async () => {
    mockFetch([
      'reject',
      { ok: true, json: SENTIMENT_RESPONSE },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when the sentiment endpoint fails', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      'reject',
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when the dashboard endpoint fails', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      { ok: true, json: SENTIMENT_RESPONSE },
      'reject',
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when any API response is non-ok', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      { ok: false, json: {} },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when regime id is unknown even if other endpoints succeed', async () => {
    mockFetch([
      { ok: true, json: { current: { regime_id: 'unknown_regime_xyz' } } },
      { ok: true, json: SENTIMENT_RESPONSE },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when sentiment value is not finite even if other endpoints succeed', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      { ok: true, json: { value: NaN, status: 'Bad' } },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when dashboard has no usable BTC 200MA delta even if other endpoints succeed', async () => {
    mockFetch([
      { ok: true, json: REGIME_RESPONSE },
      { ok: true, json: SENTIMENT_RESPONSE },
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
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when all three endpoints fail', async () => {
    mockFetch(['reject', 'reject', 'reject']);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('returns null when regime current has no regime_id or to_regime', async () => {
    mockFetch([
      { ok: true, json: { current: {} } },
      { ok: true, json: SENTIMENT_RESPONSE },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result).toBeNull();
  });

  it('uses to_regime fallback when regime_id is absent', async () => {
    mockFetch([
      { ok: true, json: { current: { to_regime: 'g' } } },
      { ok: true, json: SENTIMENT_RESPONSE },
      { ok: true, json: DASHBOARD_RESPONSE },
    ]);

    const result = await fetchRegimeStrip();

    expect(result?.items[0]).toEqual({
      label: 'Regime',
      value: 'Greed',
      detail: 'Risk-on legs active',
    });
  });
});
