import { GMX_V2_ADDRESSES } from '@zapengine/intent-engine';
import type { ExecutionSimulationContract } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import { withProtocolContractNames } from '../../../../src/modules/plan-orchestration/contractLabels';

function contract(
  address: string,
  name: string | null = null,
): ExecutionSimulationContract {
  return { address, name, verified: false, callIndexes: [0] };
}

describe('withProtocolContractNames', () => {
  it('names the GMX exchange router and the LI.FI diamond', () => {
    const result = withProtocolContractNames([
      contract(GMX_V2_ADDRESSES.exchangeRouter.toLowerCase()),
      contract('0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'),
    ]);

    expect(result.map((entry) => entry.name)).toEqual([
      'GMX Exchange Router',
      'LI.FI Diamond',
    ]);
  });

  it('matches regardless of address casing', () => {
    const [named] = withProtocolContractNames([
      contract(GMX_V2_ADDRESSES.exchangeRouter),
    ]);

    expect(named?.name).toBe('GMX Exchange Router');
  });

  it('keeps a name Tenderly already resolved', () => {
    const [named] = withProtocolContractNames([
      contract(GMX_V2_ADDRESSES.exchangeRouter, 'Spark USDC Vault'),
    ]);

    expect(named?.name).toBe('Spark USDC Vault');
  });

  it('leaves unknown contracts unnamed', () => {
    const [unknown] = withProtocolContractNames([
      contract('0x4444444444444444444444444444444444444444'),
    ]);

    expect(unknown?.name).toBeNull();
  });
});
