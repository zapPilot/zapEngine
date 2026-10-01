import { tokens } from '@zapengine/design-tokens/tokens';
import { expect, it } from 'vitest';
import { assetColor } from '@/lib/assetColors';
it('maps every allocation bucket to its shared pillar color', () => {
  for (const asset of ['btc', 'eth', 'spy', 'stable', 'alt'] as const)
    expect(assetColor(asset)).toBe(
      tokens.color.pillar[asset === 'stable' ? 'usd' : asset],
    );
});
