import type { WizardHlpState } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { describe, expect, it } from 'vitest';

import {
  hyperliquidAccountUrl,
  resolveDepositExecutionCapability,
  resolveInvestExecutionCapability,
} from '@/integration/investExecutionModel';

describe('resolveDepositExecutionCapability', () => {
  it('asks for a wallet before judging execution support', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: false,
        executionMode: undefined,
      }),
    ).toBe('connect-wallet');
  });

  it('degrades when the wallet has no execution path', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: undefined,
      }),
    ).toBe('unsupported-wallet');
  });

  it('is ready for the Privy atomic-batch path', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: 'atomic-batch',
      }),
    ).toBe('ready');
  });

  it('is ready for the wagmi EIP-7702 path (external wallet, e.g. Ambire/MetaMask)', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: 'eip7702',
      }),
    ).toBe('ready');
  });
});

describe('resolveInvestExecutionCapability', () => {
  it('asks for a wallet before checking the execution mode', () => {
    expect(
      resolveInvestExecutionCapability({
        isConnected: false,
        executionMode: undefined,
        scope: 'base',
      }),
    ).toBe('connect-wallet');
  });

  it('requires an executable wallet for either single-chain scope', () => {
    expect(
      resolveInvestExecutionCapability({
        isConnected: true,
        executionMode: undefined,
        scope: 'base',
      }),
    ).toBe('unsupported-wallet');
    expect(
      resolveInvestExecutionCapability({
        isConnected: true,
        executionMode: undefined,
        scope: 'arbitrum',
      }),
    ).toBe('unsupported-wallet');
  });

  it('requires an atomic-capable wallet for the strategy batch too', () => {
    expect(
      resolveInvestExecutionCapability({
        isConnected: true,
        executionMode: undefined,
        scope: 'both',
      }),
    ).toBe('unsupported-wallet');
  });

  it.each(['atomic-batch', 'eip7702'] as const)(
    'accepts %s for single-chain execution',
    (executionMode) => {
      expect(
        resolveInvestExecutionCapability({
          isConnected: true,
          executionMode,
          scope: 'base',
        }),
      ).toBe('ready');
    },
  );
});

describe('HLP helpers', () => {
  const step = {
    kind: 'hyperliquid-vault-deposit',
    chainId: 1337,
    afterLegIndex: 1,
    amount: { source: 'bridge-output', legIndex: 1 },
    expectedUsd: '30000000',
    minDepositUsd: '5000000',
    action: {
      type: 'vaultTransfer',
      vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      isDeposit: true,
    },
    signing: {
      scheme: 'hyperliquid-l1-action',
      hyperliquidChain: 'Mainnet',
      apiUrl: 'https://api.hyperliquid.xyz/exchange',
    },
    lockupDays: 4,
  } as WizardHlpState['step'];

  it('builds the Hyperliquid account link only when step and address exist', () => {
    const hlp: WizardHlpState = {
      status: 'arrived',
      step,
      baselineUsd6: null,
      arrivedUsd6: null,
      vaultEquityUsd6: null,
    };
    expect(hyperliquidAccountUrl(hlp, '0x1234')).toContain('hyperliquid');
    expect(hyperliquidAccountUrl(hlp, null)).toBeNull();
    expect(hyperliquidAccountUrl({ ...hlp, step: null }, '0x1234')).toBeNull();
  });
});
