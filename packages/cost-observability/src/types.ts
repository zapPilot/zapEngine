export const COST_PROVIDERS = [
  'debank',
  'openrouter',
  'brave',
  'supabase',
  'fly',
] as const;

export type CostProvider = (typeof COST_PROVIDERS)[number];

export type CostType =
  | 'actual'
  | 'estimated'
  | 'fixed'
  | 'list-price-equivalent';

export interface CostUsageItem {
  key: string;
  label: string;
  unit: 'usd' | 'units';
  value: number;
}

/**
 * Where a snapshot's numbers came from. `manual` is an operator reading a
 * provider dashboard and typing the figure in; `scraped` is an automated
 * browser session reading that same page. They are the same kind of evidence
 * -- a bill the provider itself states -- and differ only in who read it, which
 * is why they travel together everywhere a recorded bill is distinguished from
 * a collector's own estimate.
 */
export type CostSource = 'api' | 'fixed' | 'manual' | 'scraped';

export interface CostSnapshot {
  provider: CostProvider;
  periodStart: string;
  periodEnd: string;
  usage: CostUsageItem[];
  accruedCostUsd: number | null;
  projectedCostUsd: number | null;
  costType: CostType;
  source: CostSource;
  fetchedAt: string;
}

export type FetchLike = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;
