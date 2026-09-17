import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  IntentSchema,
  UnsupportedChainError,
  validateIntent,
} from '../../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('intent validator unsupported chain coverage', () => {
  it('throws UnsupportedChainError for an unsupported parsed chain', () => {
    const unsupportedChainId = 137;
    const parsedIntent = {
      type: 'SWAP' as const,
      fromAddress: '0x1234567890123456789012345678901234567890',
      chainId: unsupportedChainId,
      fromToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      toToken: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      fromAmount: '1000000000000000000',
      slippageBps: 50,
    };

    // The public schemas reject unsupported chains before the validator guard.
    // Stub only the parse result so the public validator exercises its
    // independent defensive chain assertion without exporting the helper.
    vi.spyOn(IntentSchema, 'safeParse').mockReturnValueOnce({
      success: true,
      data: parsedIntent,
    } as unknown as ReturnType<typeof IntentSchema.safeParse>);

    let thrown: unknown;
    try {
      validateIntent(parsedIntent);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnsupportedChainError);
    expect(thrown).toMatchObject({
      code: 'UNSUPPORTED_CHAIN',
      chainId: unsupportedChainId,
    });
    expect((thrown as Error).message).toContain(
      `Chain ${unsupportedChainId} not supported`,
    );
  });
});
