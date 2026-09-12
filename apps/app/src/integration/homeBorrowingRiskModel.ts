import type { BorrowingPositionsResponse } from '@zapengine/app-core/services';

export interface HomeBorrowingRiskPosition {
  protocol: string;
  chain: string;
  healthRate: number;
  liquidationBufferPct: number;
  collateralSymbols: string[];
  debtSymbols: string[];
  collateralUsd: number;
  debtUsd: number;
}

export interface HomeBorrowingRiskView {
  nearestLiquidationBufferPct: number;
  worstHealthRate: number;
  totalDebtUsd: number;
  positionCount: number;
  positions: HomeBorrowingRiskPosition[];
}

/**
 * Scenario estimate for a lending position: how far collateral could fall
 * before health factor reaches 1, assuming collateral prices move together and
 * the debt value stays flat.
 *
 * HF' = HF * (1 - drop), so HF' = 1 => drop = 1 - 1 / HF.
 * This is deliberately not described as a portfolio drawdown or exact
 * liquidation price because debt-token moves and relative collateral moves can
 * change the real threshold.
 */
export function liquidationBufferPctFromHealthRate(healthRate: number): number {
  if (!Number.isFinite(healthRate) || healthRate <= 1) return 0;
  return Math.min(100, (1 - 1 / healthRate) * 100);
}

export function buildHomeBorrowingRiskView(
  response: BorrowingPositionsResponse | undefined,
): HomeBorrowingRiskView | null {
  if (!response || response.positions.length === 0) return null;

  const positions = response.positions
    .map(
      (position): HomeBorrowingRiskPosition => ({
        protocol: position.protocol_name,
        chain: position.chain,
        healthRate: position.health_rate,
        liquidationBufferPct: liquidationBufferPctFromHealthRate(
          position.health_rate,
        ),
        collateralSymbols: position.collateral_tokens.map(
          (token) => token.symbol,
        ),
        debtSymbols: position.debt_tokens.map((token) => token.symbol),
        collateralUsd: position.collateral_usd,
        debtUsd: position.debt_usd,
      }),
    )
    .sort((a, b) => a.liquidationBufferPct - b.liquidationBufferPct);

  return {
    nearestLiquidationBufferPct: positions[0]?.liquidationBufferPct ?? 0,
    worstHealthRate: response.worst_health_rate,
    totalDebtUsd: response.total_debt_usd,
    positionCount: positions.length,
    positions,
  };
}
