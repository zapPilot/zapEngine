import { describe, expect, it, vi } from 'vitest';

import { costRepositoryFake, flyBilledRow } from '../__fixtures__/cost.js';
import type { FlyBillingCapture } from './capture.js';
import { syncFlyBilling } from './index.js';

const NOW = new Date('2026-09-11T12:00:00.000Z');

function captured(upcomingInvoiceUsd: number): FlyBillingCapture {
  return {
    status: 'captured',
    reading: {
      upcomingInvoiceUsd,
      lastInvoiceUsd: 14.69,
      creditBalanceUsd: 0,
    },
    capturedAt: NOW.toISOString(),
  };
}

function ledgerWithFly(snapshot: Parameters<typeof flyBilledRow>[0]) {
  return {
    loadLatestProviders: vi.fn().mockResolvedValue([flyBilledRow(snapshot)]),
  };
}

describe('syncFlyBilling', () => {
  it('records the upcoming invoice as month-to-date spend', async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    const result = await syncFlyBilling({
      repository: costRepositoryFake({ upsertRecordedSnapshot }),
      now: NOW,
      capture: () => Promise.resolve(captured(4.57)),
    });

    expect(result).toMatchObject({ status: 'recorded', amountUsd: 4.57 });
    expect(upsertRecordedSnapshot).toHaveBeenCalledWith({
      provider: 'fly',
      amountUsd: 4.57,
      source: 'scraped',
      now: NOW,
      usage: [],
    });
  });

  // The row is keyed on (provider, day), so this write replaces whatever the
  // flyctl collector filed this morning. Handing its usage back is the only
  // thing keeping the fleet census on screen until the next scheduled sync.
  it("keeps today's collector census instead of blanking it", async () => {
    const usage = [
      {
        key: 'compute_run_rate_monthly',
        label: 'Run-rate',
        unit: 'usd' as const,
        value: 61.2,
      },
    ];
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    await syncFlyBilling({
      repository: costRepositoryFake({
        ...ledgerWithFly({
          usage,
          fetchedAt: '2026-09-11T04:30:00.000Z',
          accruedCostUsd: null,
          source: 'api',
        }),
        upsertRecordedSnapshot,
      }),
      now: NOW,
      capture: () => Promise.resolve(captured(4.57)),
    });

    expect(upsertRecordedSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ usage }),
    );
  });

  // Re-publishing an older row's Machine counts under today's timestamp would
  // pass a stale fleet off as a current reading.
  it("drops an earlier day's census rather than re-dating it", async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    await syncFlyBilling({
      repository: costRepositoryFake({
        ...ledgerWithFly({
          usage: [
            {
              key: 'running_machines',
              label: 'Running',
              unit: 'units',
              value: 9,
            },
          ],
          fetchedAt: '2026-09-10T04:30:00.000Z',
          accruedCostUsd: null,
          source: 'api',
        }),
        upsertRecordedSnapshot,
      }),
      now: NOW,
      capture: () => Promise.resolve(captured(4.57)),
    });

    expect(upsertRecordedSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ usage: [] }),
    );
  });

  it('skips a read taken less than an hour ago', async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    const capture = vi.fn();
    const result = await syncFlyBilling({
      repository: costRepositoryFake({
        ...ledgerWithFly({
          source: 'scraped',
          accruedCostUsd: 4.57,
          fetchedAt: '2026-09-11T11:40:00.000Z',
        }),
        upsertRecordedSnapshot,
      }),
      now: NOW,
      capture,
    });

    expect(result.status).toBe('skipped');
    expect(capture).not.toHaveBeenCalled();
    expect(upsertRecordedSnapshot).not.toHaveBeenCalled();
  });

  it('reads again once the hour has passed', async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    const result = await syncFlyBilling({
      repository: costRepositoryFake({
        ...ledgerWithFly({
          source: 'scraped',
          accruedCostUsd: 4.5,
          fetchedAt: '2026-09-11T10:30:00.000Z',
        }),
        upsertRecordedSnapshot,
      }),
      now: NOW,
      capture: () => Promise.resolve(captured(4.57)),
    });

    expect(result.status).toBe('recorded');
    expect(upsertRecordedSnapshot).toHaveBeenCalled();
  });

  // A signed-out browser must never be allowed to blank a figure that is still
  // the best thing the ledger has.
  it('leaves the recorded figure alone when Fly is signed out', async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    const result = await syncFlyBilling({
      repository: costRepositoryFake({
        ...ledgerWithFly({
          source: 'scraped',
          accruedCostUsd: 4.57,
          fetchedAt: '2026-09-11T06:00:00.000Z',
        }),
        upsertRecordedSnapshot,
      }),
      now: NOW,
      capture: () => Promise.resolve({ status: 'auth_required' as const }),
    });

    expect(result).toMatchObject({ status: 'auth_required', amountUsd: 4.57 });
    expect(upsertRecordedSnapshot).not.toHaveBeenCalled();
  });

  it('reports an unreadable page without touching the ledger', async () => {
    const upsertRecordedSnapshot = vi.fn().mockResolvedValue(undefined);
    const result = await syncFlyBilling({
      repository: costRepositoryFake({ upsertRecordedSnapshot }),
      now: NOW,
      capture: () =>
        Promise.resolve({
          status: 'unavailable' as const,
          reason: 'card did not render',
        }),
    });

    expect(result.status).toBe('unavailable');
    expect(result.message).toContain('card did not render');
    expect(upsertRecordedSnapshot).not.toHaveBeenCalled();
  });
});
