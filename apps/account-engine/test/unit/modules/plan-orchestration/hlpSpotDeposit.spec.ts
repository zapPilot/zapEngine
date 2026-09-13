import type { PlanOrchestrationDepositRequest } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import { createPlanOrchestrationService } from '../../../../src/modules/plan-orchestration/service';

const USER = '0x1111111111111111111111111111111111111111' as const;

function makeService(hyperliquidNetwork?: 'mainnet' | 'testnet') {
  const forbiddenEvmSimulation = new Proxy(
    {},
    {
      get() {
        throw new Error('Spot-funded HLP deposits must not use EVM simulation');
      },
    },
  );

  return createPlanOrchestrationService({
    adapter: {} as never,
    intentEngine: {} as never,
    publicClients: {} as never,
    ...(hyperliquidNetwork ? { hyperliquidNetwork } : {}),
    simulation: { adapter: forbiddenEvmSimulation as never },
  });
}

describe('spot-funded HLP deposits', () => {
  it('builds one vaultTransfer without routing through EVM review', async () => {
    const service = makeService('testnet');
    const request: PlanOrchestrationDepositRequest = {
      kind: 'hlp-spot-deposit',
      userAddress: USER,
      amountUsd6: '12345678',
    };

    const plan = await service.buildDeposit(request);

    expect(plan).toMatchObject({
      kind: 'hlp-spot-deposit',
      execution: 'hypercore-signatures',
      amountUsd6: '12345678',
    });
    if (!('execution' in plan) || plan.execution !== 'hypercore-signatures') {
      throw new Error('Expected an HLP spot-deposit plan');
    }
    expect(plan.step.kind).toBe('hyperliquid-vault-deposit');
    expect(plan.step.amount).toEqual({
      source: 'fixed',
      amount: '12345678',
    });
    expect(plan.step.signing.hyperliquidChain).toBe('Testnet');
    expect('steps' in plan).toBe(false);

    await expect(service.buildDepositReview(request)).rejects.toThrow(
      'Spot-funded HLP deposits have no EVM batch to simulate',
    );
  });

  it('defaults Hyperliquid signing to mainnet when no network is configured', async () => {
    const service = makeService();
    const request: PlanOrchestrationDepositRequest = {
      kind: 'hlp-spot-deposit',
      userAddress: USER,
      amountUsd6: '10000000',
    };

    const plan = await service.buildDeposit(request);
    if (!('execution' in plan) || plan.execution !== 'hypercore-signatures') {
      throw new Error('Expected an HLP spot-deposit plan');
    }
    expect(plan.step.signing.hyperliquidChain).toBe('Mainnet');
  });
});
