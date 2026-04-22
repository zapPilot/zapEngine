import type { WalletClient } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  executeWithEIP7702,
  waitForEIP7702Confirmation,
} from '../../src/execution/eip7702.executor.js';
import type { PreparedTransaction } from '../../src/types/transaction.types.js';

const TARGET_A = '0x1111111111111111111111111111111111111111' as const;

function makeTx(
  overrides: Partial<PreparedTransaction> = {},
): PreparedTransaction {
  return {
    to: TARGET_A,
    data: '0xdeadbeef',
    value: '0',
    chainId: 1,
    gasLimit: '100000',
    meta: { intentType: 'TEST' },
    ...overrides,
  };
}

const mockWallet = {
  account: { address: TARGET_A },
} as unknown as WalletClient;

describe('executeWithEIP7702 - Surface Expansion', () => {
  it('should handle null or undefined inputs gracefully', async () => {
    // @ts-expect-error - testing runtime safety
    await expect(executeWithEIP7702(null, mockWallet)).rejects.toThrow(
      /empty/i,
    );

    // @ts-expect-error - testing runtime safety
    const result2 = await executeWithEIP7702([makeTx()], null);
    expect(result2.success).toBe(false);
    expect(result2.error).toMatch(/no connected account/i);
  });

  it('should handle malformed tx data without crashing', async () => {
    const malformedTxs = [
      {
        to: 'not-an-address',
        data: 'not-hex',
        value: 'not-a-number',
      } as unknown as PreparedTransaction,
    ];

    // This should return a failure result instead of crashing
    const result = await executeWithEIP7702(malformedTxs, mockWallet);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle wallet without account', async () => {
    const walletNoAccount = {} as unknown as WalletClient;
    const result = await executeWithEIP7702([makeTx()], walletNoAccount);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no connected account/i);
  });
});

describe('waitForEIP7702Confirmation - Surface Expansion', () => {
  it('should handle null or undefined inputs', async () => {
    // @ts-expect-error - testing runtime safety
    await expect(
      waitForEIP7702Confirmation(null, mockWallet),
    ).rejects.toThrow();
    // @ts-expect-error - testing runtime safety
    await expect(waitForEIP7702Confirmation('id', null)).rejects.toThrow();
  });

  it('should handle missing receipts in response', async () => {
    // waitForCallsStatus is called with the wallet and callsId.
    // When the underlying transport rejects (e.g., receipts unavailable),
    // the function should propagate the error rather than silently swallow it.
    const walletWithBrokenTransport = {
      account: { address: TARGET_A },
      // Simulate a transport that cannot fulfil the status request
      request: async () => {
        throw new Error('waitForCallsStatus: method not supported');
      },
    } as unknown as WalletClient;

    await expect(
      waitForEIP7702Confirmation('calls-id-123', walletWithBrokenTransport),
    ).rejects.toThrow();
  });
});
