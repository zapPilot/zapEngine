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
    expect(result).not.toBeNull();
    expect(result?.items.length).toBeGreaterThan(0);
  });

  it('returns null when all three endpoints fail', async () => {
    mockFetch(['reject', 'reject', 'reject']);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('returns null when sentiment value is not a valid number (line 129)', async () => {
    mockFetch([
      { ok: true, json: { current: { regime_id: 'unknown_regime_xyz' } } }, // unknown regime → returns false
      { ok: true, json: { value: NaN, status: 'Bad' } }, // NaN → returns false
      { ok: true, json: { snapshots: undefined } }, // no snapshots → delta null → returns false
    ]);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('returns null when dashboard has no snapshots (line 146)', async () => {
    mockFetch([
      { ok: true, json: { current: { regime_id: 'unknown_xyz' } } },
      { ok: true, json: { value: null } },
      { ok: true, json: {} }, // no snapshots property
    ]);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('returns null when snapshots have no valid BTC data (line 165)', async () => {
    mockFetch([
      { ok: true, json: { current: { regime_id: 'unknown_xyz' } } },
      { ok: true, json: { value: null } },
      { ok: true, json: { snapshots: [{ values: { btc: { value: null } } }] } },
    ]);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('applies only regime when sentiment and dashboard fail', async () => {
    mockFetch([{ ok: true, json: REGIME_RESPONSE }, 'reject', 'reject']);
    const result = await fetchRegimeStrip();
    expect(result?.items.find((i) => i.label === 'Regime')).toBeDefined();
  });

  it('applies only sentiment when regime and dashboard fail', async () => {
    mockFetch(['reject', { ok: true, json: SENTIMENT_RESPONSE }, 'reject']);
    const result = await fetchRegimeStrip();
    expect(result?.items.find((i) => i.label === 'FGI')).toBeDefined();
  });

  it('applies BTC delta when only dashboard succeeds', async () => {
    mockFetch(['reject', 'reject', { ok: true, json: DASHBOARD_RESPONSE }]);
    const result = await fetchRegimeStrip();
    expect(result?.items.find((i) => i.label === '200MA Δ')).toBeDefined();
  });

  it('treats non-ok API response as failed (line 78)', async () => {
    mockFetch([
      { ok: false, json: {} }, // triggers throw, caught by allSettled
      'reject',
      'reject',
    ]);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('returns null when regime current has no regime_id or to_regime (line 113)', async () => {
    mockFetch([
      { ok: true, json: { current: {} } }, // regimeId undefined → returns false
      { ok: true, json: { value: null } },
      'reject',
    ]);
    const result = await fetchRegimeStrip();
    expect(result).toBeNull();
  });

  it('uses to_regime fallback when regime_id is absent', async () => {
    mockFetch([
      { ok: true, json: { current: { to_regime: 'g' } } },
      'reject',
      'reject',
    ]);
    const result = await fetchRegimeStrip();
    expect(result?.items.find((i) => i.label === 'Regime')?.value).toBe(
      'Greed',
    );
  });
});
