import { sleeve } from './palette';

export function assetColor(
  asset: 'btc' | 'eth' | 'spy' | 'stable' | 'alt',
): string {
  return sleeve[asset];
}
