import { tokens } from '@zapengine/design-tokens/tokens';

export function assetColor(
  asset: 'btc' | 'eth' | 'spy' | 'stable' | 'alt',
): string {
  return tokens.color.pillar[asset === 'stable' ? 'usd' : asset];
}
