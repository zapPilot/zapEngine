import type {
  WizardHlpState,
  WizardLegProgress,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEPOSIT_PATH,
  GMX_DEPOSIT_PATHS,
} from '@/integration/depositPaths';
import {
  buildWizardStartInput,
  canSubmitHlpDeposit,
  hlpAmountRows,
  hyperliquidAccountUrl,
  resolveDepositExecutionCapability,
  wizardLegRows,
} from '@/integration/investExecutionModel';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const GMX_PATH = GMX_DEPOSIT_PATHS[0]!;

describe('buildWizardStartInput', () => {
  it('maps a base-invest draft onto the wizard start input', () => {
    expect(
      buildWizardStartInput({
        depositPath: DEFAULT_DEPOSIT_PATH,
        fromToken: BASE_USDC,
        fromAmount: '100000000',
      }),
    ).toEqual({ fromToken: BASE_USDC, fromAmount: '100000000' });
  });

  it('returns null for GMX paths and empty amounts', () => {
    expect(
      buildWizardStartInput({
        depositPath: GMX_PATH,
        fromToken: BASE_USDC,
        fromAmount: '100000000',
      }),
    ).toBeNull();
    expect(
      buildWizardStartInput({
        depositPath: DEFAULT_DEPOSIT_PATH,
        fromToken: BASE_USDC,
        fromAmount: '0',
      }),
    ).toBeNull();
    expect(
      buildWizardStartInput({
        depositPath: DEFAULT_DEPOSIT_PATH,
        fromToken: BASE_USDC,
        fromAmount: '',
      }),
    ).toBeNull();
  });
});

describe('resolveDepositExecutionCapability', () => {
  it('flags the GMX path as unsupported regardless of wallet state', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: 'atomic-batch',
        depositPath: GMX_PATH,
      }),
    ).toBe('unsupported-path');
  });

  it('asks for a wallet before judging execution support', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: false,
        executionMode: undefined,
        depositPath: DEFAULT_DEPOSIT_PATH,
      }),
    ).toBe('connect-wallet');
  });

  it('degrades when the wallet has no execution path (native Privy-Expo)', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: undefined,
        depositPath: DEFAULT_DEPOSIT_PATH,
      }),
    ).toBe('unsupported-wallet');
  });

  it('is ready for the Privy atomic-batch path', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: 'atomic-batch',
        depositPath: DEFAULT_DEPOSIT_PATH,
      }),
    ).toBe('ready');
  });

  it('is ready for the wagmi EIP-7702 path (external wallet, e.g. Rabby/Ambire)', () => {
    expect(
      resolveDepositExecutionCapability({
        isConnected: true,
        executionMode: 'eip7702',
        depositPath: DEFAULT_DEPOSIT_PATH,
      }),
    ).toBe('ready');
  });
});

describe('wizardLegRows', () => {
  const legs: WizardLegProgress[] = [
    { chainId: 8453, kind: 'supply', protocol: 'morpho', status: 'pending' },
    {
      chainId: 1337,
      kind: 'bridge',
      protocol: 'hyperliquid',
      status: 'destinationConfirmed',
      sourceTxHash: `0x${'a'.repeat(64)}`,
      destinationTxHash: `0x${'b'.repeat(64)}`,
    },
    { chainId: 1, kind: 'bridge', status: 'failed' },
  ];

  it('labels legs with chain names, status tones, and explorer links', () => {
    const rows = wizardLegRows(legs, 8453);

    expect(rows[0]).toMatchObject({
      title: 'Deposit on Base · morpho',
      statusLabel: 'Pending',
      statusTone: 'neutral',
      sourceTxUrl: null,
      destinationTxUrl: null,
    });

    expect(rows[1]).toMatchObject({
      title: 'Bridge to Hyperliquid · hyperliquid',
      statusLabel: 'Completed',
      statusTone: 'success',
    });
    expect(rows[1]!.sourceTxUrl).toContain('basescan.org');
    expect(rows[1]!.destinationTxUrl).toContain('hyperliquid');

    expect(rows[2]).toMatchObject({
      title: 'Bridge to Ethereum',
      statusLabel: 'Failed',
      statusTone: 'error',
    });
  });
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

  it('only allows submission once funds arrived and the lock is accepted', () => {
    expect(canSubmitHlpDeposit('arrived', true)).toBe(true);
    expect(canSubmitHlpDeposit('arrived', false)).toBe(false);
    expect(canSubmitHlpDeposit('awaitingArrival', true)).toBe(false);
    expect(canSubmitHlpDeposit('confirming', true)).toBe(false);
    expect(canSubmitHlpDeposit('deposited', true)).toBe(false);
  });

  it('formats amount rows and skips values that are not known yet', () => {
    const hlp: WizardHlpState = {
      status: 'arrived',
      step,
      baselineUsd6: 0n,
      arrivedUsd6: 29500000n,
      vaultEquityUsd6: null,
    };
    expect(hlpAmountRows(hlp)).toEqual([
      { label: 'Expected', value: '30.00 USDC' },
      { label: 'Arrived', value: '29.50 USDC' },
    ]);
  });

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
