import { readFileSync } from 'node:fs';

import type { BrowserContext } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';

import { costRepositoryFake, flyBilledRow } from '../__fixtures__/cost.js';
import { captureFlyBilling } from './capture.js';
import { syncFlyBilling } from './index.js';

const BILLING_PAGE = readFileSync(
  new URL('./__fixtures__/billing-page.html', import.meta.url),
  'utf8',
);

const launchFlyChrome = vi.hoisted(() => vi.fn());
const restoreFlySession = vi.hoisted(() => vi.fn());
const saveFlySession = vi.hoisted(() => vi.fn());

vi.mock('./browser.js', () => ({ launchFlyChrome }));
vi.mock('./session.js', () => ({ restoreFlySession, saveFlySession }));

function page(url: string, html = BILLING_PAGE) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue(html),
    url: vi.fn(() => url),
  };
}

function contextFor(p: ReturnType<typeof page>) {
  return {
    pages: () => [],
    newPage: vi.fn().mockResolvedValue(p),
    close: vi.fn().mockResolvedValue(undefined),
    cookies: vi.fn(),
    addCookies: vi.fn(),
  } as unknown as BrowserContext;
}

describe('fly-billing capture now fallback', () => {
  it('captures with the default clock when now is omitted', async () => {
    const p = page('https://fly.io/dashboard/chang-tai-wei/billing');
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(2);
    saveFlySession.mockResolvedValueOnce(1);

    const result = await captureFlyBilling();

    expect(result.status).toBe('captured');
    if (result.status === 'captured') {
      expect(Date.parse(result.capturedAt)).toBeLessThanOrEqual(Date.now());
    }
  });
});

describe('syncFlyBilling defaults and amount fallbacks', () => {
  it('uses the default clock, log, and capture when omitted', async () => {
    const p = page('https://fly.io/dashboard/chang-tai-wei/billing');
    const ctx = contextFor(p);
    launchFlyChrome.mockResolvedValueOnce(ctx);
    restoreFlySession.mockResolvedValueOnce(2);
    saveFlySession.mockResolvedValueOnce(1);
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);

    const result = await syncFlyBilling({
      repository: costRepositoryFake({ upsertRecordedSnapshot }),
    });

    expect(result.status).toBe('recorded');
    expect(upsertRecordedSnapshot).toHaveBeenCalled();
  });

  it('reports null when signed out with no prior figure', async () => {
    const result = await syncFlyBilling({
      repository: costRepositoryFake({}),
      now: new Date('2026-09-11T12:00:00.000Z'),
      capture: () => Promise.resolve({ status: 'auth_required' as const }),
    });

    expect(result).toMatchObject({ status: 'auth_required', amountUsd: null });
  });

  it('keeps the prior figure when the page is unreadable', async () => {
    const result = await syncFlyBilling({
      repository: costRepositoryFake({
        loadLatestProviders: vi.fn().mockResolvedValue([
          flyBilledRow({
            accruedCostUsd: 4.57,
            fetchedAt: '2026-09-11T06:00:00.000Z',
          }),
        ]),
      }),
      now: new Date('2026-09-11T12:00:00.000Z'),
      capture: () =>
        Promise.resolve({
          status: 'unavailable' as const,
          reason: 'card did not render',
        }),
    });

    expect(result).toMatchObject({ status: 'unavailable', amountUsd: 4.57 });
  });
});
