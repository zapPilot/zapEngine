import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TransactionPanel } from '@/components/wallet/portfolio/views/invest/trading/components/TransactionPanel';

// Mock hooks and providers
const mockSetValue = vi.fn();
const mockHandleSubmit = vi.fn();

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: vi.fn(() => ({ isConnected: true })),
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
        if (field === 'chainId') return 1;
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
        selectedToken: { symbol: 'USDC', address: '0x123' },
        tokenQuery: {
          isLoading: false,
          data: [
            { symbol: 'USDC', address: '0x123' },
            { symbol: 'USDT', address: '0x456' },
            { symbol: 'DAI', address: '0x789' },
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

    const usdcBtn = screen.getByText('USDC');
    expect(usdcBtn.className).toContain('bg-gray-900');

    const usdtBtn = screen.getByText('USDT');
    expect(usdtBtn.className).toContain('bg-gray-50');
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
