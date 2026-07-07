import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  assertApprovalCaps,
  assertMinReceived,
  PlanSafetyViolationError,
} from '../../src/validators/plan-safety.validator.js';

const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SPENDER = '0x1111111111111111111111111111111111111111';

function approveTx(amount: bigint, token = TOKEN) {
  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER as `0x${string}`, amount],
    }),
    value: '0',
    chainId: 8453,
    meta: { intentType: 'ERC20_APPROVE' },
  };
}

function lifiCall(estimate: { toAmount: string; toAmountMin: string }) {
  return {
    to: SPENDER,
    data: '0xdeadbeef',
    value: '0',
    chainId: 8453,
    meta: {
      intentType: 'LIFI_SWAP',
      route: { estimate },
    },
  };
}

describe('assertApprovalCaps', () => {
  it('accepts exact-amount approvals within the intent amount', () => {
    expect(() =>
      assertApprovalCaps(
        { approvals: [approveTx(1_000_000n)], calls: [] },
        { fromToken: TOKEN, fromAmount: '1000000' },
      ),
    ).not.toThrow();
  });

  it('rejects an unlimited approval', () => {
    expect(() =>
      assertApprovalCaps(
        { approvals: [approveTx(maxUint256)], calls: [] },
        { fromToken: TOKEN, fromAmount: '1000000' },
      ),
    ).toThrow(PlanSafetyViolationError);
  });

  it('rejects an approval of the intent token above the intent amount', () => {
    expect(() =>
      assertApprovalCaps(
        { approvals: [approveTx(2_000_000n)], calls: [] },
        { fromToken: TOKEN, fromAmount: '1000000' },
      ),
    ).toThrow(PlanSafetyViolationError);
  });

  it('checks approve calls embedded in the calls array too', () => {
    expect(() =>
      assertApprovalCaps({ approvals: [], calls: [approveTx(maxUint256)] }, {}),
    ).toThrow(PlanSafetyViolationError);
  });

  it('leaves intermediate-token approvals bounded only by the unlimited rule', () => {
    const otherToken = '0x2222222222222222222222222222222222222222';
    expect(() =>
      assertApprovalCaps(
        { approvals: [approveTx(5_000_000n, otherToken)], calls: [] },
        { fromToken: TOKEN, fromAmount: '1000000' },
      ),
    ).not.toThrow();
  });

  it('ignores non-approve transactions', () => {
    expect(() =>
      assertApprovalCaps(
        {
          approvals: [],
          calls: [lifiCall({ toAmount: '100', toAmountMin: '99' })],
        },
        {},
      ),
    ).not.toThrow();
  });
});

describe('assertMinReceived', () => {
  it('accepts a route whose min-received sits within the slippage cap', () => {
    expect(() =>
      assertMinReceived(
        { calls: [lifiCall({ toAmount: '1000000', toAmountMin: '995000' })] },
        { maxSlippageBps: 100 },
      ),
    ).not.toThrow();
  });

  it('rejects a route whose min-received implies excess slippage', () => {
    expect(() =>
      assertMinReceived(
        { calls: [lifiCall({ toAmount: '1000000', toAmountMin: '900000' })] },
        { maxSlippageBps: 100 },
      ),
    ).toThrow(PlanSafetyViolationError);
  });

  it('rejects a zero min-received', () => {
    expect(() =>
      assertMinReceived(
        { calls: [lifiCall({ toAmount: '1000000', toAmountMin: '0' })] },
        { maxSlippageBps: 100 },
      ),
    ).toThrow(PlanSafetyViolationError);
  });

  it('skips calls that carry no routed estimate', () => {
    expect(() =>
      assertMinReceived({ calls: [approveTx(1n)] }, { maxSlippageBps: 100 }),
    ).not.toThrow();
  });
});
