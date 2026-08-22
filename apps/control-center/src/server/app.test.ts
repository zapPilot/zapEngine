import { describe, expect, it, vi } from 'vitest';

import type { OverviewResponse } from '../shared/types.js';
import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const overview: OverviewResponse = {
  generatedAt: '2026-08-16T12:00:00.000Z',
  accruedCostUsd: 12.83,
  projectedCostUsd: 24.2,
  cashInvoiceSpendUsd: null,
  aumUsd: null,
  activeAccounts: null,
  socialReach: 42,
  providers: [],
  social: {
    status: 'ok',
    message: null,
    window: 'latest',
    generatedAt: '2026-08-16T12:00:00.000Z',
    accounts: [],
    episodes: [],
  },
};

describe('control center API', () => {
  it('returns the cached overview and forwards explicit refresh', async () => {
    const getOverview = vi.fn().mockResolvedValue(overview);
    const app = createControlCenterApp({
      config: readControlCenterConfig({}),
      service: {
        getOverview,
        getSocial: vi.fn().mockResolvedValue(overview.social),
      },
      serveClient: false,
    });

    const response = await app.request('/api/overview?refresh=1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accruedCostUsd: 12.83,
      socialReach: 42,
    });
    expect(getOverview).toHaveBeenCalledWith(true);
  });

  it('normalizes unknown social windows to latest', async () => {
    const getSocial = vi.fn().mockResolvedValue(overview.social);
    const app = createControlCenterApp({
      config: readControlCenterConfig({}),
      service: { getOverview: vi.fn(), getSocial },
      serveClient: false,
    });

    expect(
      (await app.request('/api/social-performance?window=nope')).status,
    ).toBe(200);
    expect(getSocial).toHaveBeenCalledWith('latest');
  });
});
