import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionPanel } from '@/components/wallet/portfolio/views/invest/trading/components/TransactionPanel';

// Mock hooks and providers
const mockSetValue = vi.fn();
const mockHandleSubmit = vi.fn();
const walletProviderMocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(() => ({ isConnected: true, chain: { id: 8453 } })),
}));
const investStrategyMocks = vi.hoisted(() => {
  const run = vi.fn();

  return {
    run,
    useInvestStrategy: vi.fn(() => ({
      run,
      pending: false,
      lastError: null,
      tier: 'eip7702',
      lastCallsId: '0xabcdef1234567890',
      lastTxHash: null,
      lastTxHashes: [],
      lastPlan: {
        legs: [
          {
            protocol: 'morpho',
            chainId: 8453,
            kind: 'supply',
            toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            fromAmount: '60000000',
            toAmountMin: '60000000',
            gasUsd: '0.12',
            durationSec: 12,
          },
          {
            chainId: 1,
            kind: 'bridge',
            toToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            fromAmount: '20000000',
            toAmountMin: '20000000',
            bridge: 'across',
            gasUsd: '0.20',
            durationSec: 3,
          },
          {
            chainId: 42161,
            kind: 'bridge',
            toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            fromAmount: '20000000',
            toAmountMin: '20000000',
            bridge: 'relaydepository',
            gasUsd: '0.20',
            durationSec: 1,
          },
        ],
        approvals: [],
        calls: [],
        totalGasUsd: '0.52',
        sourceChainId: 8453,
      },
      legs: [
        { chainId: 8453, kind: 'supply', status: 'submitted' },
        { chainId: 1, kind: 'bridge', status: 'bridgePending' },
        { chainId: 42161, kind: 'bridge', status: 'destinationConfirmed' },
      ],
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : String(error),
    })),
  };
});

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: walletProviderMocks.useWalletProvider,
}));

vi.mock('@/hooks/useInvestStrategy', () => ({
  useInvestStrategy: investStrategyMocks.useInvestStrategy,
}));

vi.mock('@/hooks/queries/wallet/useTokenBalances', () => ({
  useTokenBalances: vi.fn(() => ({
    byAddress: new Map(),
  })),
}));

vi.mock(
  '@/components/wallet/portfolio/modals/hooks/useTransactionForm',
  () => ({
    useTransactionForm: vi.fn(() => ({
      formState: { isValid: true },
      control: {},
      setValue: mockSetValue,
      handleSubmit: vi.fn((cb) => () => cb()),
      watch: vi.fn((field: string) => {
        if (field === 'chainId') return 8453;
        if (field === 'tokenAddress') return '0x123';
        if (field === 'amount') return '100';
        return '';
      }),
    })),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/modals/hooks/useWatchedTransactionData',
  () => ({
    useWatchedTransactionData: vi.fn(() => ({
      amount: '100',
      transactionData: {
        selectedToken: {
          symbol: 'USDC',
          address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          name: 'USD Coin',
          chainId: 8453,
          decimals: 6,
        },
        tokenQuery: {
          isLoading: false,
          data: [
            {
              symbol: 'USDC',
              address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              name: 'USD Coin',
              chainId: 8453,
              decimals: 6,
            },
            {
              symbol: 'USDT',
              address: '0x456',
              name: 'Tether',
              chainId: 8453,
              decimals: 6,
            },
            {
              symbol: 'DAI',
              address: '0x789',
              name: 'Dai',
              chainId: 8453,
              decimals: 18,
            },
          ],
        },
      },
    })),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/modals/hooks/useTransactionSubmission',
  () => ({
    useTransactionSubmission: vi.fn(() => ({
      status: 'idle',
      result: null,
      isSubmitting: false,
      isSubmitDisabled: false,
      handleSubmit: mockHandleSubmit,
      resetState: vi.fn(),
    })),
  }),
);

vi.mock('@/services', () => ({
  transactionServiceMock: {
    simulateDeposit: vi.fn(),
    simulateWithdraw: vi.fn(),
  },
}));

// Mock BaseTradingPanel
vi.mock(
  '@/components/wallet/portfolio/views/invest/trading/components/BaseTradingPanel',
  () => ({
    BaseTradingPanel: ({
      title,
      subtitle,
      children,
      footer,
      isReviewOpen,
      onCloseReview,
      onConfirmReview,
      reviewTitle,
    }: {
      title: React.ReactNode;
      subtitle: string;
      children: React.ReactNode;
      footer: React.ReactNode;
      isReviewOpen: boolean;
      onCloseReview: () => void;
      onConfirmReview: () => void;
      reviewTitle?: string;
    }) => (
      <div data-testid="base-trading-panel">
        <div data-testid="panel-title">{title}</div>
        <div data-testid="panel-subtitle">{subtitle}</div>
        <div data-testid="panel-children">{children}</div>
        <div data-testid="panel-footer">{footer}</div>
        {isReviewOpen && (
          <div data-testid="review-modal">
            <span>{reviewTitle}</span>
            <button data-testid="close-review" onClick={onCloseReview}>
              Close
            </button>
            <button data-testid="confirm-review" onClick={onConfirmReview}>
              Confirm
            </button>
          </div>
        )}
      </div>
    ),
  }),
);

describe('TransactionPanel', () => {
  beforeEach(() => {
    mockSetValue.mockClear();
    mockHandleSubmit.mockClear();
    walletProviderMocks.useWalletProvider.mockReturnValue({
      isConnected: true,
      chain: { id: 8453 },
    });
  });

  it('renders deposit mode with correct subtitle', () => {
    render(<TransactionPanel mode="deposit" />);

    expect(screen.getByText('Add capital to your strategy.')).toBeDefined();
  });

  it('renders withdraw mode with correct subtitle', () => {
    render(<TransactionPanel mode="withdraw" />);

    expect(screen.getByText('Withdraw funds to your wallet.')).toBeDefined();
  });

  it('renders capitalized mode title', () => {
    render(<TransactionPanel mode="deposit" />);

    const title = screen.getByTestId('panel-title');
    expect(title.textContent).toBe('deposit');
  });

  it('renders amount input', () => {
    render(<TransactionPanel mode="deposit" />);

    const input = screen.getByPlaceholderText('0.00');
    expect(input).toBeDefined();
  });

  it('renders token buttons', () => {
    render(<TransactionPanel mode="deposit" />);

    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('USDT')).toBeDefined();
    expect(screen.getByText('DAI')).toBeDefined();
  });

  it('calls setValue when token button is clicked', () => {
    render(<TransactionPanel mode="deposit" />);

    fireEvent.click(screen.getByText('USDT'));

    expect(mockSetValue).toHaveBeenCalledWith('tokenAddress', '0x456');
  });

  it('calls setValue when amount input changes', () => {
    render(<TransactionPanel mode="deposit" />);

    const input = screen.getByPlaceholderText('0.00');
    fireEvent.change(input, { target: { value: '250' } });

    expect(mockSetValue).toHaveBeenCalledWith('amount', '250');
  });

  it('renders review button with deposit label', () => {
    render(<TransactionPanel mode="deposit" />);

    expect(screen.getByText('Review Deposit')).toBeDefined();
  });

  it('renders review button with withdrawal label', () => {
    render(<TransactionPanel mode="withdraw" />);

    expect(screen.getByText('Review Withdrawal')).toBeDefined();
  });

  it('renders the backend deposit strategy result in the deposit debug panel', () => {
    render(<TransactionPanel mode="deposit" />);

    expect(
      screen.getByText('Invest deposit route · Base source'),
    ).toBeDefined();
    expect(screen.getByText('Tier: EIP-7702')).toBeDefined();
    expect(screen.getByText(/Supply · Base · 60,000,000/)).toBeDefined();
    expect(screen.getByText(/Bridge · Ethereum · 20,000,000/)).toBeDefined();
    expect(screen.getByText(/Bridge · Arbitrum · 20,000,000/)).toBeDefined();
    expect(screen.getByText('0xabcd...7890')).toBeDefined();
  });

  it('lets the invest strategy button trigger Base switching when the wallet is not on Base', () => {
    walletProviderMocks.useWalletProvider.mockReturnValue({
      isConnected: true,
      chain: { id: 1 },
    });

    render(<TransactionPanel mode="deposit" />);

    const button = screen.getByRole('button', {
      name: 'Switch to Base & Invest',
    });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(investStrategyMocks.run).toHaveBeenCalled();
    expect(
      screen.queryByText(
        'Connect to Base - Ethereum/Arbitrum legs route through Base in v1',
      ),
    ).toBeNull();
  });

  it('opens review modal on button click', () => {
    render(<TransactionPanel mode="deposit" />);

    fireEvent.click(screen.getByText('Review Deposit'));

    expect(screen.getByTestId('review-modal')).toBeDefined();
    expect(screen.getByText('Confirm Deposit')).toBeDefined();
  });

  it('closes review modal', () => {
    render(<TransactionPanel mode="deposit" />);

    fireEvent.click(screen.getByText('Review Deposit'));
    fireEvent.click(screen.getByTestId('close-review'));

    expect(screen.queryByTestId('review-modal')).toBeNull();
  });

  it('highlights selected token', () => {
    render(<TransactionPanel mode="deposit" />);

    const usdcBtn = screen.getByText('USDC').closest('button');
    expect(usdcBtn).toHaveAttribute('aria-pressed', 'true');

    const usdtBtn = screen.getByText('USDT').closest('button');
    expect(usdtBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders token loading skeletons when loading', async () => {
    const { useWatchedTransactionData } =
      await import('@/components/wallet/portfolio/modals/hooks/useWatchedTransactionData');
    vi.mocked(useWatchedTransactionData).mockReturnValue({
      amount: '',
      transactionData: {
        selectedToken: null,
        tokenQuery: { isLoading: true, data: undefined },
      },
    } as ReturnType<typeof useWatchedTransactionData>);

    const { container } = render(<TransactionPanel mode="deposit" />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders USD suffix on amount input', () => {
    render(<TransactionPanel mode="deposit" />);

    expect(screen.getByText('USD')).toBeDefined();
  });
});
