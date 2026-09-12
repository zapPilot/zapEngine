import type { BorrowingPositionsResponse } from '@zapengine/app-core/services';
import { describe, expect, it } from 'vitest';

import {
  buildHomeBorrowingRiskView,
  liquidationBufferPctFromHealthRate,
} from '@/integration/homeBorrowingRiskModel';

function response(): BorrowingPositionsResponse {
  return {
    positions: [
      {
        protocol_id: 'morpho',
        protocol_name: 'Morpho',
        chain: 'eth',
        health_rate: 1.95,
        health_status: 'WARNING',
        collateral_usd: 48_800,
        debt_usd: 20_000,
        net_value_usd: 28_800,
        collateral_tokens: [
          { symbol: 'wstETH', amount: 14.88, value_usd: 48_800 },
        ],
        debt_tokens: [{ symbol: 'USDT', amount: 20_000, value_usd: 20_000 }],
        updated_at: '2026-09-11T00:00:00Z',
      },
      {
        protocol_id: 'morpho',
        protocol_name: 'Morpho',
        chain: 'eth',
        health_rate: 1.655,
        health_status: 'WARNING',
        collateral_usd: 17_000,
        debt_usd: 8_472,
        net_value_usd: 8_528,
        collateral_tokens: [
          { symbol: 'WBTC', amount: 0.2134, value_usd: 17_000 },
        ],
        debt_tokens: [{ symbol: 'EURCV', amount: 7_304, value_usd: 8_472 }],
        updated_at: '2026-09-11T00:00:00Z',
      },
    ],
    total_collateral_usd: 65_800,
    total_debt_usd: 28_472,
    worst_health_rate: 1.655,
    last_updated: '2026-09-11T00:00:00Z',
  };
}

describe('liquidationBufferPctFromHealthRate', () => {
  it('translates health factor into an easier collateral-drop scenario', () => {
    expect(liquidationBufferPctFromHealthRate(1.655)).toBeCloseTo(39.58, 2);
    expect(liquidationBufferPctFromHealthRate(1.95)).toBeCloseTo(48.72, 2);
  });

  it('floors positions already at or below the liquidation threshold at zero', () => {
    expect(liquidationBufferPctFromHealthRate(1)).toBe(0);
    expect(liquidationBufferPctFromHealthRate(0.9)).toBe(0);
  });
});

describe('buildHomeBorrowingRiskView', () => {
  it('keeps same-protocol markets separate and surfaces the nearest liquidation', () => {
    const view = buildHomeBorrowingRiskView(response());

    expect(view).not.toBeNull();
    expect(view?.positionCount).toBe(2);
    expect(view?.totalDebtUsd).toBe(28_472);
    expect(view?.worstHealthRate).toBe(1.655);
    expect(view?.nearestLiquidationBufferPct).toBeCloseTo(39.58, 2);
    expect(
      view?.positions.map((position) => position.collateralSymbols),
    ).toEqual([['WBTC'], ['wstETH']]);
    expect(view?.positions.map((position) => position.debtSymbols)).toEqual([
      ['EURCV'],
      ['USDT'],
    ]);
  });

  it('returns no Home risk section when there are no borrowing positions', () => {
    const empty = response();
    empty.positions = [];

    expect(buildHomeBorrowingRiskView(empty)).toBeNull();
  });
});
