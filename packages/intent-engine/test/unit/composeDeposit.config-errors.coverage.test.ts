import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { USDC_ADDRESS } from '../../src/registry/chains.js';
import { composeDeposit } from '../../src/strategies/composeDeposit.js';

const getVaultForBucket = vi.hoisted(() => vi.fn());

vi.mock('../../src/registry/chains.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/registry/chains.js')>();
  return {
    ...actual,
    USDC_ADDRESS: { ...actual.USDC_ADDRESS },
  };
});

vi.mock('../../src/registry/vaults.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/registry/vaults.js')>();
  return {
    ...actual,
    getVaultForBucket,
  };
});

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ETHEREUM_USDC = USDC_ADDRESS[1]!;

function makeDeps() {
  return {
    adapter: {} as never,
    publicClients: {
      8453: { chain: { id: 8453 } } as never,
    },
  };
}

afterEach(() => {
  getVaultForBucket.mockReset();
  USDC_ADDRESS[1] = ETHEREUM_USDC;
});

describe('composeDeposit defensive configuration errors', () => {
  it('rejects a configured stable vault whose protocol is not Morpho', async () => {
    getVaultForBucket.mockReturnValue({
      protocol: 'gmx-v2',
      vault: '0x2222222222222222222222222222222222222222',
      asset: BASE_USDC,
    });

    await expect(
      composeDeposit(
        {
          fromToken: BASE_USDC,
          fromAmount: '10000',
          sourceChainId: 8453,
          userAddress: USER,
          split: { 8453: 1 },
        },
        makeDeps(),
      ),
    ).rejects.toThrow('Unsupported stable deposit protocol gmx-v2');
  });

  it('rejects a destination chain with no configured USDC address', async () => {
    Reflect.deleteProperty(USDC_ADDRESS, 1);

    await expect(
      composeDeposit(
        {
          fromToken: BASE_USDC,
          fromAmount: '10000',
          sourceChainId: 8453,
          userAddress: USER,
          split: { 1: 1 },
        },
        makeDeps(),
      ),
    ).rejects.toThrow('No USDC address configured for chain 1');
  });
});
