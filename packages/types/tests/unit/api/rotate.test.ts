import { describe, expect, it } from 'vitest';

import {
  PlanOrchestrationRotateReviewRequestSchema,
  RotatePlanSchema,
} from '../../../src/api/rotate.js';

const USER = '0x' + 'a'.repeat(40);
const FROM_VAULT = '0x' + 'b'.repeat(40);
const TO_VAULT = '0x' + 'c'.repeat(40);

const request = {
  userAddress: USER,
  chainId: 8453,
  fromVault: FROM_VAULT,
  toVault: TO_VAULT,
  shareAmount: '100000000000000',
};

describe('PlanOrchestrationRotateReviewRequestSchema', () => {
  it('accepts a vault-to-vault rotation', () => {
    expect(
      PlanOrchestrationRotateReviewRequestSchema.safeParse(request).success,
    ).toBe(true);
  });

  it.each([
    [
      'same vault (any case)',
      { toVault: FROM_VAULT.toUpperCase().replace('0X', '0x') },
    ],
    ['zero shares', { shareAmount: '0' }],
    ['decimal shares', { shareAmount: '1.5' }],
    ['bad address', { fromVault: '0x1234' }],
    ['unknown field', { slippageBps: 500 }],
  ])('rejects %s', (_, override) => {
    expect(
      PlanOrchestrationRotateReviewRequestSchema.safeParse({
        ...request,
        ...override,
      }).success,
    ).toBe(false);
  });
});

describe('RotatePlanSchema', () => {
  const plan = {
    approvals: [],
    calls: [
      {
        to: FROM_VAULT,
        data: '0xba087652',
        value: '0',
        chainId: 8453,
        meta: { intentType: 'WITHDRAW' },
      },
    ],
    totalGasUsd: '0.01',
    sourceChainId: 8453,
  };

  it('accepts a single source-chain batch', () => {
    expect(RotatePlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects bridge legs and follow-ups', () => {
    expect(RotatePlanSchema.safeParse({ ...plan, legs: [] }).success).toBe(
      false,
    );
    expect(RotatePlanSchema.safeParse({ ...plan, followUps: [] }).success).toBe(
      false,
    );
  });
});
