/**
 * Provider-neutral portfolio display types. Home, Portfolio, Send, and
 * Strategy depend on these shapes.
 */

export type ChainKey = 'ethereum' | 'arbitrum' | 'base';

export interface DemoAsset {
  symbol: string;
  name: string;
  usdValue: number | null;
  amountLabel: string;
  chains: ChainKey[];
}

export type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';
