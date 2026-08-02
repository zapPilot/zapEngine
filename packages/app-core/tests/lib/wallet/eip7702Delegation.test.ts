import {
  EIP7702_DELEGATES,
  inspectDelegation,
} from '@core/lib/wallet/eip7702Delegation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCode: vi.fn(),
  getPublicClient: vi.fn(),
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

function delegationCode(address: string): `0x${string}` {
  return `0xef0100${address.slice(2).toLowerCase()}` as `0x${string}`;
}

describe('inspectDelegation', () => {
  beforeEach(() => {
    mocks.getCode.mockReset();
    mocks.getPublicClient.mockReset().mockReturnValue({
      getCode: mocks.getCode,
    });
  });

  it.each([
    ['current', EIP7702_DELEGATES.okx, 'OKX SmartWalletEntry'],
    ['legacy', EIP7702_DELEGATES.okxLegacy, 'OKX EIP-7702 Delegator (legacy)'],
  ])(
    'recognizes the %s OKX implementation',
    async (_, implementation, label) => {
      mocks.getCode.mockResolvedValue(delegationCode(implementation));

      await expect(
        inspectDelegation({
          address: '0x1111111111111111111111111111111111111111',
          chainId: 8453,
        }),
      ).resolves.toEqual({
        kind: 'delegated',
        implementation,
        label,
        walletLabel: 'OKX Wallet',
      });
    },
  );

  it('returns diagnostic metadata without blocking an unrecognized implementation', async () => {
    const implementation = '0x0000000000000000000000000000000000000002';
    mocks.getCode.mockResolvedValue(delegationCode(implementation));

    await expect(
      inspectDelegation({
        address: '0x1111111111111111111111111111111111111111',
        chainId: 8453,
      }),
    ).resolves.toEqual({
      kind: 'delegated',
      implementation,
      label: 'Unrecognized EIP-7702 implementation',
    });
  });
});
