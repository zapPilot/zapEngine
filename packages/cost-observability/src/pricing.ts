import type { CostProvider } from './types.js';

export interface CostPricingRate {
  id: string;
  provider: CostProvider;
  metricKey: string;
  unit: string;
  priceUsd: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function resolvePricingRate(
  rates: CostPricingRate[],
  input: { provider: CostProvider; metricKey: string; at: Date },
): CostPricingRate | null {
  const at = input.at.getTime();
  return (
    rates
      .filter(
        (rate) =>
          rate.provider === input.provider &&
          rate.metricKey === input.metricKey &&
          Date.parse(rate.effectiveFrom) <= at &&
          (rate.effectiveTo === null || Date.parse(rate.effectiveTo) > at),
      )
      .sort(
        (a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom),
      )[0] ?? null
  );
}
