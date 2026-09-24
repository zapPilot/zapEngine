import { describe, expect, it } from 'vitest';

import { bridgeChain, normalizeUsdcInput } from '@/integration/bridgeTestModel';

describe('bridgeTestModel coverage', () => {
  it('resolves supported bridge chains by id', () => {
    expect(bridgeChain(1)).toMatchObject({ chainId: 1, canSource: true });
    expect(bridgeChain(8453)).toMatchObject({ chainId: 8453 });
  });

  it('keeps whole-only USDC input without adding a fraction', () => {
    expect(normalizeUsdcInput('100')).toBe('100');
    expect(normalizeUsdcInput('1,000')).toBe('1000');
  });
});
