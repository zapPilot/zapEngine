import { describe, expect, it } from 'vitest';

import {
  CHAIN_IDS,
  MORPHO_VAULTS,
  TOKENS,
  ValidationError,
  validateSupplyIntent,
  validateSwapIntent,
} from '../../src/index.js';

const FROM_ADDRESS = '0x1234567890123456789012345678901234567890';
const UNKNOWN_TOKEN_A = '0x1111111111111111111111111111111111111111';
const UNKNOWN_TOKEN_B = '0x2222222222222222222222222222222222222222';

describe('intent validator registry coverage', () => {
  it('allows unknown tokens when the target chain has no registry entry', () => {
    const tokenRegistry = TOKENS as unknown as Record<
      number,
      Record<string, string>
    >;
    const baseTokens = tokenRegistry[CHAIN_IDS.BASE];
    if (!baseTokens) {
      throw new Error('Expected Base token registry fixture');
    }

    delete tokenRegistry[CHAIN_IDS.BASE];
    try {
      const result = validateSwapIntent({
        type: 'SWAP',
        fromAddress: FROM_ADDRESS,
        chainId: CHAIN_IDS.BASE,
        fromToken: UNKNOWN_TOKEN_A,
        toToken: UNKNOWN_TOKEN_B,
        fromAmount: '1000000',
      });

      expect(result.fromToken).toBe(UNKNOWN_TOKEN_A);
      expect(result.toToken).toBe(UNKNOWN_TOKEN_B);
    } finally {
      tokenRegistry[CHAIN_IDS.BASE] = baseTokens;
    }
  });

  it('rejects a vault known on another chain with mismatch details', () => {
    const vaultAddress = MORPHO_VAULTS[CHAIN_IDS.BASE].SPARK_USDC;
    let caught: unknown;

    try {
      validateSupplyIntent({
        type: 'SUPPLY',
        fromAddress: FROM_ADDRESS,
        chainId: CHAIN_IDS.ETHEREUM,
        fromToken: TOKENS[CHAIN_IDS.ETHEREUM].USDC,
        fromAmount: '1000000',
        vaultAddress,
        protocol: 'morpho',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((caught as ValidationError).message).toContain(vaultAddress);
    expect((caught as ValidationError).message).toContain(
      `known on chain ${CHAIN_IDS.BASE}`,
    );
    expect((caught as ValidationError).message).toContain(
      `not chain ${CHAIN_IDS.ETHEREUM}`,
    );
  });
});
