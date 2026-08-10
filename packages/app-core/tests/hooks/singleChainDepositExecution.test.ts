import { assertNativeGmxSpendWithinRequestedAmount } from '@core/hooks/singleChainDepositExecution';
import { type DepositPlan, NATIVE_TOKEN_ADDRESS } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const TARGET = '0x2222222222222222222222222222222222222222';

function planWithValue(value: string): DepositPlan {
  return {
    legs: [],
    approvals: [],
    calls: [
      {
        to: TARGET,
        data: '0x1234',
        value,
        chainId: 42161,
        meta: { intentType: 'SUPPLY' },
      },
    ],
    totalGasUsd: '0',
    sourceChainId: 42161,
  };
}

describe('assertNativeGmxSpendWithinRequestedAmount', () => {
  it('blocks the 0.001 ETH input -> 0.005 ETH planned-spend regression', () => {
    expect(() =>
      assertNativeGmxSpendWithinRequestedAmount({
        request: {
          kind: 'gmx-v2-basket',
          fromToken: NATIVE_TOKEN_ADDRESS,
          amount: '1000000000000000',
          userAddress: USER,
        },
        plan: planWithValue('5000000000000000'),
      }),
    ).toThrow('exceeding the requested 0.001 ETH budget');
  });

  it('allows a native GMX plan whose wallet value stays within the entered budget', () => {
    expect(() =>
      assertNativeGmxSpendWithinRequestedAmount({
        request: {
          kind: 'gmx-v2-basket',
          fromToken: NATIVE_TOKEN_ADDRESS,
          amount: '10000000000000000',
          userAddress: USER,
        },
        plan: planWithValue('10000000000000000'),
      }),
    ).not.toThrow();
  });

  it('does not apply the native ETH budget invariant to ERC-20 funding', () => {
    expect(() =>
      assertNativeGmxSpendWithinRequestedAmount({
        request: {
          kind: 'gmx-v2-basket',
          fromToken: USDC,
          amount: '1000000',
          userAddress: USER,
        },
        plan: planWithValue('4000000000000000'),
      }),
    ).not.toThrow();
  });
});
