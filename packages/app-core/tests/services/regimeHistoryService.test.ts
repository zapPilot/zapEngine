import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  validate: vi.fn((value: unknown) => value),
}));

vi.mock('@core/lib/http', () => ({
  httpUtils: { analyticsEngine: { get: mocks.get } },
}));

vi.mock('@core/lib/http/createServiceCaller', () => ({
  createApiServiceCaller:
    () =>
    async <T>(callback: () => Promise<T>): Promise<T> =>
      callback(),
}));

vi.mock('@core/schemas/api/regimeHistorySchemas', () => ({
  validateRegimeHistoryResponse: mocks.validate,
}));

import {
  DEFAULT_REGIME_HISTORY,
  fetchRegimeHistory,
} from '@core/services/regimeHistoryService';

describe('regimeHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the default limit and maps previous/cached fields', async () => {
    const response = {
      current: { to_regime: 'g' },
      previous: { to_regime: 'n' },
      direction: 'fromLeft',
      duration_in_current: { days: 2 },
      transitions: [{ from_regime: 'n', to_regime: 'g' }],
      timestamp: '2026-09-15T00:00:00Z',
      cached: true,
    };
    mocks.get.mockResolvedValue(response);

    await expect(fetchRegimeHistory()).resolves.toEqual({
      currentRegime: 'g',
      previousRegime: 'n',
      direction: 'fromLeft',
      duration: { days: 2 },
      transitions: response.transitions,
      timestamp: response.timestamp,
      cached: true,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v2/market/regime/history?limit=2',
    );
    expect(mocks.validate).toHaveBeenCalledWith(response);
  });

  it('supports explicit limits and defaults missing previous/cached values', async () => {
    mocks.get.mockResolvedValue({
      current: { to_regime: 'n' },
      previous: null,
      direction: 'default',
      duration_in_current: null,
      transitions: [],
      timestamp: '2026-09-15T00:00:00Z',
    });

    await expect(fetchRegimeHistory(7)).resolves.toMatchObject({
      currentRegime: 'n',
      previousRegime: null,
      cached: false,
    });
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v2/market/regime/history?limit=7',
    );
  });

  it('exports a neutral default suitable for graceful degradation', () => {
    expect(DEFAULT_REGIME_HISTORY).toMatchObject({
      currentRegime: 'n',
      previousRegime: null,
      direction: 'default',
      cached: false,
      transitions: [],
    });
    expect(Number.isNaN(Date.parse(DEFAULT_REGIME_HISTORY.timestamp))).toBe(
      false,
    );
  });
});
