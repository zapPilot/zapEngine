import { describe, expect, it } from 'vitest';

import {
  IntentSchema,
  RebalanceIntentSchema,
} from '../../src/types/intent.types.js';

const validRebalanceIntent = {
  type: 'REBALANCE',
  fromAddress: '0x1234567890123456789012345678901234567890',
  chainId: 8453,
  legs: [
    {
      protocol: 'morpho',
      action: 'supply',
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountWei: '1000000',
      vaultAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    },
  ],
} as const;

describe('RebalanceIntentSchema', () => {
  it('parses a valid rebalance intent and applies base defaults', () => {
    const parsed = RebalanceIntentSchema.parse(validRebalanceIntent);

    expect(parsed.type).toBe('REBALANCE');
    expect(parsed.slippageBps).toBe(50);
    expect(parsed.legs).toHaveLength(1);
    expect(parsed.legs[0]?.protocol).toBe('morpho');
  });

  it('is included in the top-level intent union', () => {
    const parsed = IntentSchema.parse(validRebalanceIntent);

    expect(parsed.type).toBe('REBALANCE');
  });

  it('requires at least one leg', () => {
    const result = RebalanceIntentSchema.safeParse({
      ...validRebalanceIntent,
      legs: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects unsupported protocols', () => {
    const result = RebalanceIntentSchema.safeParse({
      ...validRebalanceIntent,
      legs: [{ ...validRebalanceIntent.legs[0], protocol: 'aave' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects zero wei amounts', () => {
    const result = RebalanceIntentSchema.safeParse({
      ...validRebalanceIntent,
      legs: [{ ...validRebalanceIntent.legs[0], amountWei: '0' }],
    });

    expect(result.success).toBe(false);
  });
});
