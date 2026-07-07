import { HyperliquidVaultDepositStepSchema } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import {
  buildHlpDepositFollowUp,
  buildVaultTransferAction,
  HLP_VAULTS,
  HYPERCORE_CHAIN_ID,
} from '../../src/protocols/hyperliquid/index.js';

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
      minDepositUsd: '5000000',
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
