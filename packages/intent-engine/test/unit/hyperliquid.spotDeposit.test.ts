import { describe, expect, it } from 'vitest';

import { buildHlpSpotDepositPlan } from '../../src/protocols/hyperliquid/index.js';

describe('buildHlpSpotDepositPlan', () => {
  it('emits exactly one fixed vaultTransfer action', () => {
    const plan = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });

    expect(plan.step.kind).toBe('hyperliquid-vault-deposit');
    expect(plan.step.amount).toEqual({ source: 'fixed', amount: '10000000' });
    expect(plan.step.action).toEqual(
      expect.objectContaining({ type: 'vaultTransfer', isDeposit: true }),
    );
    expect(plan.step.afterLegIndex).toBeUndefined();
    expect(plan.step.expectedUsd).toBeUndefined();
  });

  it('preserves the exact 6-decimal base-unit amount', () => {
    expect(
      buildHlpSpotDepositPlan({ amountUsd6: '12345678' }).step.amount,
    ).toEqual({ source: 'fixed', amount: '12345678' });
    expect(
      buildHlpSpotDepositPlan({ amountUsd6: '10000001' }).step.amount,
    ).toEqual({ source: 'fixed', amount: '10000001' });
  });

  it('targets the selected Hyperliquid network', () => {
    const mainnet = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });
    expect(mainnet.step.signing.hyperliquidChain).toBe('Mainnet');

    const testnet = buildHlpSpotDepositPlan({
      amountUsd6: '10000000',
      network: 'testnet',
    });
    expect(testnet.step.signing.hyperliquidChain).toBe('Testnet');
    expect(testnet.step.action.vaultAddress).not.toBe(
      mainnet.step.action.vaultAddress,
    );
  });

  it('marks the plan as bypassing EVM batch execution', () => {
    const plan = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });
    expect(plan.kind).toBe('hlp-spot-deposit');
    expect(plan.execution).toBe('hypercore-signatures');
    expect('steps' in plan).toBe(false);
  });
});
