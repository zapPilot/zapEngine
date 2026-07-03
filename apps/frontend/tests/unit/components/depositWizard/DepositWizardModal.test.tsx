import { fireEvent, render, screen } from '@testing-library/react';
import {
  type DepositWizardState,
  initialDepositWizardState,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DepositWizardModal } from '@/components/wallet/portfolio/modals/depositWizard/DepositWizardModal';

const USER = '0x1111111111111111111111111111111111111111';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const mocks = vi.hoisted(() => ({
  useDepositWizard: vi.fn(),
  useWalletProvider: vi.fn(),
  start: vi.fn(),
  runHlpDeposit: vi.fn(),
  retry: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@zapengine/app-core/hooks/useDepositWizard', () => ({
  useDepositWizard: mocks.useDepositWizard,
}));

vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

const hlpStep = {
  kind: 'hyperliquid-vault-deposit',
  chainId: 1337,
  afterLegIndex: 1,
  amount: { source: 'bridge-output', legIndex: 1 },
  expectedUsd: '29000000',
  minDepositUsd: '5000000',
  action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
  signing: {
    scheme: 'hyperliquid-l1-action',
    hyperliquidChain: 'Mainnet',
    apiUrl: 'https://api.hyperliquid.xyz',
  },
  lockupDays: 4,
} as const;

function hookState(overrides: {
  wizard?: Partial<DepositWizardState>;
  pending?: boolean;
}) {
  return {
    pending: overrides.pending ?? false,
    lastError: null,
    tier: null,
    lastTxHash: null,
    lastTxHashes: [],
    lastCallsId: null,
    lastPlan: null,
    getErrorMessage: () => 'error',
    wizard: { ...initialDepositWizardState, ...overrides.wizard },
    start: mocks.start,
    runHlpDeposit: mocks.runHlpDeposit,
    retry: mocks.retry,
    reset: mocks.reset,
  };
}

describe('DepositWizardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({ account: { address: USER } });
    mocks.start.mockResolvedValue(undefined);
    mocks.runHlpDeposit.mockResolvedValue(undefined);
  });

  it('gates the start CTA on a valid amount and the 4-day lock disclosure', () => {
    mocks.useDepositWizard.mockReturnValue(hookState({}));
    render(<DepositWizardModal isOpen onClose={vi.fn()} />);

    const button = screen.getByTestId('wizard-start-button');
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByTestId('wizard-amount-input'), {
      target: { value: '100' },
    });
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByTestId('wizard-lock-checkbox'));
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ fromAmount: '100000000' }),
    );
  });

  it('shows leg progress during bridging with the stepper on step 3', () => {
    mocks.useDepositWizard.mockReturnValue(
      hookState({
        wizard: {
          stage: 'bridging',
          legs: [
            { chainId: 8453, kind: 'supply', status: 'sourceConfirmed' },
            {
              chainId: 1337,
              kind: 'bridge',
              status: 'bridgePending',
              sourceTxHash: '0xsource',
            },
          ],
        },
      }),
    );
    render(<DepositWizardModal isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('wizard-step-3')).toHaveAttribute(
      'data-status',
      'active',
    );
    expect(screen.getByTestId('wizard-leg-list')).toBeInTheDocument();
    expect(screen.getByText('Bridging…')).toBeInTheDocument();
    expect(screen.getByText('Bridge → Hyperliquid')).toBeInTheDocument();
  });

  it('keeps the HLP CTA disabled until funds arrive, then submits', () => {
    mocks.useDepositWizard.mockReturnValue(
      hookState({
        wizard: {
          stage: 'hyperliquidDeposit',
          hlp: {
            status: 'awaitingArrival',
            step: hlpStep,
            baselineUsd6: 0n,
            arrivedUsd6: null,
            vaultEquityUsd6: null,
          },
        },
      }),
    );
    const { rerender } = render(
      <DepositWizardModal isOpen onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('wizard-hlp-button')).toBeDisabled();

    mocks.useDepositWizard.mockReturnValue(
      hookState({
        wizard: {
          stage: 'hyperliquidDeposit',
          hlp: {
            status: 'arrived',
            step: hlpStep,
            baselineUsd6: 0n,
            arrivedUsd6: 29_500_000n,
            vaultEquityUsd6: null,
          },
        },
      }),
    );
    rerender(<DepositWizardModal isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('wizard-hlp-arrived')).toHaveTextContent(
      '29.50 USDC',
    );
    const button = screen.getByTestId('wizard-hlp-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.runHlpDeposit).toHaveBeenCalled();
  });

  it('surfaces stage errors with a dismiss action', () => {
    mocks.useDepositWizard.mockReturnValue(
      hookState({
        wizard: {
          stage: 'bridging',
          error: { stage: 'bridging', message: 'A bridge transfer failed' },
        },
      }),
    );
    render(<DepositWizardModal isOpen onClose={vi.fn()} />);

    expect(screen.getByTestId('wizard-error')).toHaveTextContent(
      'A bridge transfer failed',
    );
    fireEvent.click(screen.getByText('Dismiss'));
    expect(mocks.retry).toHaveBeenCalled();
  });

  it('asks for confirmation before closing mid-flight', () => {
    const onClose = vi.fn();
    mocks.useDepositWizard.mockReturnValue(
      hookState({ wizard: { stage: 'bridging' } }),
    );
    render(<DepositWizardModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('wizard-close-confirm')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close anyway'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the done summary and resets on close', () => {
    const onClose = vi.fn();
    mocks.useDepositWizard.mockReturnValue(
      hookState({
        wizard: {
          stage: 'done',
          legs: [
            { chainId: 8453, kind: 'supply', status: 'sourceConfirmed' },
            {
              chainId: 1337,
              kind: 'bridge',
              status: 'destinationConfirmed',
              destinationTxHash: '0xdest',
            },
          ],
          hlp: {
            status: 'deposited',
            step: hlpStep,
            baselineUsd6: 0n,
            arrivedUsd6: 29_500_000n,
            vaultEquityUsd6: 29_400_000n,
          },
        },
      }),
    );
    render(<DepositWizardModal isOpen onClose={onClose} />);

    expect(screen.getByTestId('wizard-done-step')).toBeInTheDocument();
    expect(screen.getByText(/HLP equity: 29.40 USDC/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wizard-close-button'));
    expect(mocks.reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
