export type SpotAssetSymbol = 'BTC' | 'ETH' | 'SPY';

export function normalizeSpotAsset(value: unknown): SpotAssetSymbol | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'BTC' || normalized === 'ETH' || normalized === 'SPY') {
    return normalized;
  }

  return null;
}
