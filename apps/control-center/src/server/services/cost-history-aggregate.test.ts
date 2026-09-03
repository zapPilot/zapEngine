import type { CostProvider } from '@zapengine/cost-observability';
import { describe, expect, it } from 'vitest';

import { ledgerRow } from './__fixtures__/cost.js';
import {
  aggregateByProviderForMonth,
  aggregateDaily,
  aggregateMonthly,
  describeSnapshot,
  FLY_RUN_RATE_ONLY_MESSAGE,
  rowToSnapshot,
  toProviderResults,
  type SnapshotRow,
} from './cost-history-aggregate.js';

const FETCHED_AT = '2026-09-01T09:31:28.411Z';

/**
 * A priced OpenRouter row read on the first of September, which every case
 * varies rather than restates: the fields a test overrides are the ones that
 * test is about.
 */
function row(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return ledgerRow({
    snapshot_date: '2026-09-01',
    period_start: '2026-09-01T00:00:00.000Z',
    period_end: FETCHED_AT,
    fetched_at: FETCHED_AT,
    ...overrides,
  });
}

describe('aggregateDaily', () => {
  it('groups by date, keeps every provider, and totals only the priced rows', () => {
    const points = aggregateDaily([
      row(),
      row({
        provider: 'supabase',
        accrued_cost_usd: 25,
        cost_type: 'fixed',
        source: 'fixed',
      }),
      row({
        provider: 'fly',
        accrued_cost_usd: null,
        projected_cost_usd: null,
        cost_type: 'estimated',
      }),
      row({ snapshot_date: '2026-09-02', accrued_cost_usd: 0.5 }),
    ]);

    // Rows arrive ascending, so the chart's last point is the latest day.
    expect(points.map((point) => point.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
    ]);
    expect(points[0]?.accruedCostUsd).toBeCloseTo(25.12, 8);
    expect(points[0]?.providers).toEqual([
      {
        provider: 'supabase',
        label: 'Supabase',
        accruedCostUsd: 25,
        costType: 'fixed',
        source: 'fixed',
        periodEnd: FETCHED_AT,
      },
      {
        provider: 'openrouter',
        label: 'OpenRouter',
        accruedCostUsd: 0.12,
        costType: 'actual',
        source: 'api',
        periodEnd: FETCHED_AT,
      },
      {
        provider: 'fly',
        label: 'Fly.io',
        accruedCostUsd: null,
        costType: 'estimated',
        source: 'api',
        periodEnd: FETCHED_AT,
      },
    ]);
  });

  it('dates each day from its own row rather than the newest reading', () => {
    const points = aggregateDaily([
      row({
        provider: 'fly',
        source: 'manual',
        accrued_cost_usd: 14.02,
        period_end: '2026-09-01T09:00:00.000Z',
      }),
      row({
        provider: 'fly',
        source: 'manual',
        accrued_cost_usd: 21.4,
        snapshot_date: '2026-09-08',
        period_end: '2026-09-08T09:00:00.000Z',
      }),
    ]);

    // Recording a fresh Fly figure today must not restamp last week's tooltip
    // with today's reading time.
    expect(points.map((point) => point.providers[0]?.periodEnd)).toEqual([
      '2026-09-01T09:00:00.000Z',
      '2026-09-08T09:00:00.000Z',
    ]);
  });

  it('reports a day with nothing priced as unknown rather than zero', () => {
    const [point] = aggregateDaily([
      row({ provider: 'fly', accrued_cost_usd: null }),
      row({
        provider: 'debank',
        accrued_cost_usd: null,
        cost_type: 'list-price-equivalent',
      }),
    ]);

    expect(point?.accruedCostUsd).toBeNull();
    expect(point?.providers.map((entry) => entry.provider)).toEqual([
      'debank',
      'fly',
    ]);
  });

  it('orders a day priced-first and descending, ties by provider name', () => {
    const [point] = aggregateDaily([
      row({ provider: 'fly', accrued_cost_usd: null }),
      row({ provider: 'debank', accrued_cost_usd: 2 }),
      row({ provider: 'supabase', accrued_cost_usd: 25 }),
      row({ accrued_cost_usd: 2 }),
    ]);

    expect(point?.providers.map((entry) => entry.provider)).toEqual([
      'supabase',
      'debank',
      'openrouter',
      'fly',
    ]);
  });
});

describe('aggregateMonthly', () => {
  it('keeps the latest row per provider per month and sums the priced ones', () => {
    expect(
      aggregateMonthly([
        row({ snapshot_date: '2026-08-05', accrued_cost_usd: 3.25 }),
        row({ snapshot_date: '2026-08-31', accrued_cost_usd: 11.5 }),
        row({
          provider: 'supabase',
          snapshot_date: '2026-08-31',
          accrued_cost_usd: 25,
        }),
        row({
          provider: 'fly',
          snapshot_date: '2026-08-31',
          accrued_cost_usd: null,
        }),
        row({ snapshot_date: '2026-09-01', accrued_cost_usd: 0.5 }),
      ]),
    ).toEqual([
      { month: '2026-08', accruedCostUsd: 36.5 },
      { month: '2026-09', accruedCostUsd: 0.5 },
    ]);
  });
});

describe('aggregateByProviderForMonth', () => {
  it('separates "no row that month" from "spent nothing that month"', () => {
    // The caller hands this to the projection as a prior: null means "no data,
    // fall back to extrapolation", 0 means "really spent nothing, damp it".
    expect(
      aggregateByProviderForMonth(
        [
          row({ snapshot_date: '2026-08-31', accrued_cost_usd: 0 }),
          row({
            provider: 'supabase',
            snapshot_date: '2026-09-01',
            accrued_cost_usd: 25,
          }),
        ],
        '2026-08',
      ),
    ).toEqual([
      { provider: 'debank', accruedCostUsd: null },
      { provider: 'openrouter', accruedCostUsd: 0 },
      { provider: 'supabase', accruedCostUsd: null },
      { provider: 'fly', accruedCostUsd: null },
    ]);
  });
});

describe('rowToSnapshot', () => {
  it('coerces the numeric strings PostgREST returns and keeps real nulls', () => {
    expect(
      rowToSnapshot(
        row({ accrued_cost_usd: '0.12789037', projected_cost_usd: null }),
      ),
    ).toMatchObject({ accruedCostUsd: 0.12789037, projectedCostUsd: null });
  });
});

describe('toProviderResults', () => {
  const NOW = new Date('2026-09-02T06:55:34.382Z');

  function providerCards(rows: SnapshotRow[]) {
    const results = toProviderResults(rows, NOW);
    return (provider: CostProvider) =>
      results.find((result) => result.provider === provider);
  }

  it('keeps an unpriced row and says why it has no cost', () => {
    const card = providerCards([
      row(),
      row({ provider: 'fly', accrued_cost_usd: null, cost_type: 'estimated' }),
      row({
        provider: 'debank',
        accrued_cost_usd: null,
        cost_type: 'list-price-equivalent',
      }),
    ]);

    expect(card('fly')).toMatchObject({
      status: 'ok',
      message: FLY_RUN_RATE_ONLY_MESSAGE,
    });
    expect(card('fly')?.snapshot?.accruedCostUsd).toBeNull();
    expect(card('debank')).toMatchObject({
      status: 'ok',
      message: 'Usage synced; USD cost unknown',
    });
    expect(card('openrouter')).toMatchObject({ status: 'ok', message: null });
  });

  it('withholds a previous month and reads differently from never configured', () => {
    const card = providerCards([
      row(),
      row({
        provider: 'fly',
        snapshot_date: '2026-08-31',
        accrued_cost_usd: 14.02,
        projected_cost_usd: 14.02,
        cost_type: 'estimated',
        source: 'manual',
      }),
    ]);

    // August's recorded bill is August's. Handing it over with a snapshot is
    // how it would reach a September headline as spend nobody incurred.
    expect(card('fly')).toEqual({
      provider: 'fly',
      label: 'Fly.io',
      status: 'unconfigured',
      costType: 'estimated',
      snapshot: null,
      message:
        'Last reading 2026-08-31 is 2026-08 spend; nothing recorded for 2026-09',
    });
    expect(card('supabase')).toMatchObject({
      status: 'unconfigured',
      message: 'No snapshot yet',
    });
  });

  it('keeps the first row met per provider, so the query must be newest-first', () => {
    const card = providerCards([
      row({ snapshot_date: '2026-09-02', accrued_cost_usd: 0.5 }),
      row(),
    ]);

    expect(card('openrouter')?.snapshot?.accruedCostUsd).toBe(0.5);
  });
});

describe('describeSnapshot', () => {
  it('says why an unpriced row has no cost instead of leaving a bare dash', () => {
    expect(
      describeSnapshot(row({ provider: 'fly', accrued_cost_usd: null })),
    ).toBe(FLY_RUN_RATE_ONLY_MESSAGE);
    expect(
      describeSnapshot(row({ provider: 'debank', accrued_cost_usd: null })),
    ).toBe('Usage synced; USD cost unknown');
    expect(
      describeSnapshot(
        row({ provider: 'fly', accrued_cost_usd: 14.02, source: 'manual' }),
      ),
    ).toBeNull();
  });
});
