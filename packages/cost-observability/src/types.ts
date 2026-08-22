export const COST_PROVIDERS = [
  'debank',
  'openrouter',
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

export type CostSource = 'api' | 'fixed' | 'manual';

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
