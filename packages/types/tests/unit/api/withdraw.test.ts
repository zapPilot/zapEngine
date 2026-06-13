import { describe, expect, it } from 'vitest';

import {
  WithdrawLegSchema,
  WithdrawPlanSchema,
  PlanOrchestrationWithdrawRequestSchema,
} from '../../../src/api/withdraw.js';
import { AddressSchema } from '../../../src/api/deposit.js';

const USER = '0x' + 'a'.repeat(40);
const VAULT = '0x' + 'b'.repeat(40);
const APPROVAL = '0x' + 'c'.repeat(40);
const TOKEN = '0x' + 'd'.repeat(40);

describe('WithdrawLegSchema', () => {
  it('accepts a withdraw leg', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 8453,
      kind: 'withdraw',
      protocol: 'morpho',
      toToken: TOKEN,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 120,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a swap leg', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 8453,
      kind: 'swap',
      toToken: TOKEN,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 60,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a leg without optional protocol', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 42161,
      kind: 'withdraw',
      toToken: TOKEN,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.5',
      durationSec: 30,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 8453,
      kind: 'bridge',
      toToken: TOKEN,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 120,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative durationSec', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 8453,
      kind: 'withdraw',
      toToken: TOKEN,
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid toToken', () => {
    const result = WithdrawLegSchema.safeParse({
      chainId: 8453,
      kind: 'withdraw',
      toToken: '0x123',
      fromAmount: '1000000',
      toAmountMin: '990000',
      gasUsd: '0.42',
      durationSec: 120,
    });
    expect(result.success).toBe(false);
  });
});

describe('WithdrawPlanSchema', () => {
  const basePlan = {
    approvals: [],
    calls: [],
    totalGasUsd: '0',
    sourceChainId: 8453,
  };

  it('accepts a plan with a withdraw leg', () => {
    const result = WithdrawPlanSchema.safeParse({
      ...basePlan,
      legs: [
        {
          chainId: 8453,
          kind: 'withdraw',
          toToken: TOKEN,
          fromAmount: '1000000',
          toAmountMin: '990000',
          gasUsd: '0.42',
          durationSec: 120,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a plan with a swap leg', () => {
    const result = WithdrawPlanSchema.safeParse({
      ...basePlan,
      legs: [
        {
          chainId: 8453,
          kind: 'swap',
          toToken: TOKEN,
          fromAmount: '1000000',
          toAmountMin: '990000',
          gasUsd: '0.42',
          durationSec: 120,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a plan with empty approvals and calls', () => {
    const result = WithdrawPlanSchema.safeParse({
      approvals: [],
      calls: [],
      totalGasUsd: '1.5',
      sourceChainId: 42161,
      legs: [
        {
          chainId: 42161,
          kind: 'withdraw',
          toToken: TOKEN,
          fromAmount: '500000',
          toAmountMin: '490000',
          gasUsd: '0.8',
          durationSec: 180,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a plan missing sourceChainId', () => {
    const result = WithdrawPlanSchema.safeParse({
      legs: [],
      approvals: [],
      calls: [],
      totalGasUsd: '0',
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('rejects a plan using deposit leg kinds', () => {
    const result = WithdrawPlanSchema.safeParse({
      ...basePlan,
      legs: [
        {
          chainId: 8453,
          kind: 'supply',
          toToken: TOKEN,
          fromAmount: '1000000',
          toAmountMin: '990000',
          gasUsd: '0.42',
          durationSec: 120,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('PlanOrchestrationWithdrawRequestSchema (morpho branch)', () => {
  it('accepts a valid morpho withdraw with toToken', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000',
      chainId: 8453,
      toToken: TOKEN,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid morpho withdraw without toToken', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000',
      chainId: 8453,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid vault address', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: '0x123',
      shareAmount: '1000000',
      chainId: 8453,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric shareAmount', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1.5',
      chainId: 8453,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative chainId', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000',
      chainId: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('PlanOrchestrationWithdrawRequestSchema (gmx-v2 branch)', () => {
  it('accepts a valid gmx-v2 btc-btc withdraw', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'btc-btc',
      gmAmount: '1000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid gmx-v2 eth-eth withdraw', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'eth-eth',
      gmAmount: '500000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid gmx-v2 btc-usdc withdraw', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'btc-usdc',
      gmAmount: '1000000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid gmx-v2 eth-usdc withdraw', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'eth-usdc',
      gmAmount: '1000000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown marketKey', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'doge-usdc',
      gmAmount: '1000000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric gmAmount', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'btc-btc',
      gmAmount: 'abc',
    });
    expect(result.success).toBe(false);
  });

  it('accepts gmx-v2 with extra fields (Zod passthrough)', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'btc-btc',
      gmAmount: '1000000',
      chainId: 8453,
    });
    expect(result.success).toBe(true);
  });
});

describe('PlanOrchestrationWithdrawRequestSchema (discriminatedUnion)', () => {
  it('rejects a payload with no kind', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000',
      chainId: 8453,
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('rejects a payload with an unknown kind', () => {
    const result = PlanOrchestrationWithdrawRequestSchema.safeParse({
      kind: 'unknown',
      userAddress: USER,
    } as unknown);
    expect(result.success).toBe(false);
  });
});
