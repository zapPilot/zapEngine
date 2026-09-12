import { describe, expect, it } from 'vitest';

import { buildHlpSpotDepositPlan } from '../../src/protocols/hyperliquid/index.js';

describe('buildHlpSpotDepositPlan', () => {
  it('denominates the class transfer in dollars, not base units', () => {
    const plan = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });
    const [transfer] = plan.steps;

    // The single most dangerous regression in this flow: usdClassTransfer
    // takes dollars while vaultTransfer takes 6-decimal base units. Emitting
    // base units here would move $10,000,000 instead of $10.
    expect(transfer.action.amountUsd).toBe('10.000000');
    expect(transfer.action.amountUsd).not.toBe('10000000');
    expect(transfer.action.toPerp).toBe(true);
    expect(transfer.amountUsd6).toBe('10000000');
  });

  it('keeps sub-dollar precision through the conversion', () => {
    expect(
      buildHlpSpotDepositPlan({ amountUsd6: '12345678' }).steps[0].action
        .amountUsd,
    ).toBe('12.345678');
    expect(
      buildHlpSpotDepositPlan({ amountUsd6: '10000001' }).steps[0].action
        .amountUsd,
    ).toBe('10.000001');
  });

  it('funds the vault step with a fixed amount and no bridge leg', () => {
    const [, vault] = buildHlpSpotDepositPlan({
      amountUsd6: '25000000',
    }).steps;

    expect(vault.amount).toEqual({ source: 'fixed', amount: '25000000' });
    // A bridge-output amount would demand an arrival delta that never comes.
    expect(vault.afterLegIndex).toBeUndefined();
    expect(vault.expectedUsd).toBeUndefined();
    expect(vault.action.isDeposit).toBe(true);
  });

  it('routes both signatures to the same network endpoint', () => {
    const mainnet = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });
    expect(mainnet.steps[0].signing).toEqual(mainnet.steps[1].signing);
    expect(mainnet.steps[0].signing.hyperliquidChain).toBe('Mainnet');

    const testnet = buildHlpSpotDepositPlan({
      amountUsd6: '10000000',
      network: 'testnet',
    });
    expect(testnet.steps[0].signing.hyperliquidChain).toBe('Testnet');
    expect(testnet.steps[1].action.vaultAddress).not.toBe(
      mainnet.steps[1].action.vaultAddress,
    );
  });

  it('marks the plan as bypassing EVM batch execution', () => {
    const plan = buildHlpSpotDepositPlan({ amountUsd6: '10000000' });
    expect(plan.kind).toBe('hlp-spot-deposit');
    expect(plan.execution).toBe('hypercore-signatures');
  });
});
