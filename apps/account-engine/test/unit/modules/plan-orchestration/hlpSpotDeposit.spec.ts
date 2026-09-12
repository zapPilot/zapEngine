import type { PlanOrchestrationDepositRequest } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import { createPlanOrchestrationService } from '../../../../src/modules/plan-orchestration/service';

const USER = '0x1111111111111111111111111111111111111111' as const;

function makeService() {
  return createPlanOrchestrationService({
    adapter: {} as never,
    intentEngine: {} as never,
    publicClients: {} as never,
    hyperliquidNetwork: 'testnet',
  });
}

describe('spot-funded HLP deposits', () => {
  it('builds a HyperCore signature plan without routing through EVM review', async () => {
    const service = makeService();
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
    if (!('kind' in plan) || plan.kind !== 'hlp-spot-deposit') {
      throw new Error('Expected an HLP spot-deposit plan');
    }
    expect(plan.steps[0]?.signing.hyperliquidChain).toBe('Testnet');

    await expect(service.buildDepositReview(request)).rejects.toThrow(
      'Spot-funded HLP deposits have no EVM batch to simulate',
    );
  });
});
