import { HyperliquidVaultDepositStepSchema } from '@zapengine/types/api';
import { decodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  buildHlpDepositFollowUp,
  buildVaultTransferAction,
  encodeBridge2Deposit,
  HLP_MIN_DEPOSIT_USD,
  HLP_VAULTS,
  HYPERCORE_CHAIN_ID,
  HYPERLIQUID_BRIDGE2_ADDRESS,
} from '../../src/protocols/hyperliquid/index.js';

describe('encodeBridge2Deposit', () => {
  it('encodes the exact USDC transfer into the Bridge2 escrow', () => {
    expect(encodeBridge2Deposit(10_000_000n)).toBe(
      '0xa9059cbb0000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df70000000000000000000000000000000000000000000000000000000000989680',
    );
  });

  it('round-trips through the ERC-20 ABI', () => {
    expect(
      decodeFunctionData({
        abi: erc20Abi,
        data: encodeBridge2Deposit(25_000_000n),
      }),
    ).toEqual({
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE2_ADDRESS, 25_000_000n],
    });
  });

  it('rejects non-positive amounts', () => {
    expect(() => encodeBridge2Deposit(0n)).toThrow(
      'Hyperliquid Bridge2 deposit amount must be positive',
    );
    expect(() => encodeBridge2Deposit(-1n)).toThrow(
      'Hyperliquid Bridge2 deposit amount must be positive',
    );
  });

  it('keeps the HLP minimum above the 5 USDC Bridge2 credit floor', () => {
    // Bridge2 silently discards Arbitrum USDC deposits under 5 USDC.
    expect(BigInt(HLP_MIN_DEPOSIT_USD)).toBeGreaterThanOrEqual(5_000_000n);
  });
});

describe('buildVaultTransferAction', () => {
  it('builds the exact unsigned vaultTransfer action with a lowercased address', () => {
    expect(
      buildVaultTransferAction({
        vaultAddress: '0xDFc24b077bc1425AD1DEA75bCB6f8158E10Df303',
      }),
    ).toEqual({
      type: 'vaultTransfer',
      vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      isDeposit: true,
    });
  });
});

describe('buildHlpDepositFollowUp', () => {
  it('builds a schema-valid mainnet descriptor by default', () => {
    const followUp = buildHlpDepositFollowUp({
      afterLegIndex: 1,
      expectedUsd: '3000000',
    });

    expect(followUp).toEqual({
      kind: 'hyperliquid-vault-deposit',
      chainId: HYPERCORE_CHAIN_ID,
      afterLegIndex: 1,
      amount: { source: 'bridge-output', legIndex: 1 },
      expectedUsd: '3000000',
      minDepositUsd: '10000000',
      action: {
        type: 'vaultTransfer',
        vaultAddress: HLP_VAULTS.mainnet.toLowerCase(),
        isDeposit: true,
      },
      signing: {
        scheme: 'hyperliquid-l1-action',
        hyperliquidChain: 'Mainnet',
        apiUrl: 'https://api.hyperliquid.xyz',
      },
      lockupDays: 4,
    });
    expect(HyperliquidVaultDepositStepSchema.safeParse(followUp).success).toBe(
      true,
    );
  });

  it('flips vault, chain marker, and api url together for testnet', () => {
    const followUp = buildHlpDepositFollowUp({
      afterLegIndex: 0,
      expectedUsd: '9000000',
      network: 'testnet',
    });

    expect(followUp.action.vaultAddress).toBe(HLP_VAULTS.testnet.toLowerCase());
    expect(followUp.signing).toEqual({
      scheme: 'hyperliquid-l1-action',
      hyperliquidChain: 'Testnet',
      apiUrl: 'https://api.hyperliquid-testnet.xyz',
    });
    expect(followUp.amount).toEqual({ source: 'bridge-output', legIndex: 0 });
  });
});
