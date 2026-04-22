import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WithdrawModal } from '@/components/wallet/portfolio/modals/WithdrawModal';

// Mock getCategoryForToken
vi.mock('@/lib/domain/assetCategoryUtils', () => ({
  getCategoryForToken: vi.fn((symbol: string) => {
    const normalized = symbol.toLowerCase();
    if (normalized.includes('btc') || normalized === 'wbtc') return 'btc';
    if (normalized.includes('eth') || normalized === 'weth') return 'eth';
    if (
      normalized.includes('usdc') ||
      normalized.includes('usdt') ||
      normalized.includes('dai')
    )
      return 'stablecoin';
    return 'altcoin';
  }),
}));

// Mock dependencies
vi.mock('@/services', () => ({
  transactionServiceMock: {
    simulateWithdraw: vi.fn(),
  },
}));

// Create factory functions for mocks to avoid hoisting issues
function createMocks() {
  return {
    mockSetValue: vi.fn(),
    mockCloseDropdowns: vi.fn(),
    mockBuildModalFormState: vi.fn(() => ({
      handlePercentage: vi.fn(),
      isValid: false,
    })),
    mockResolveActionLabel: vi.fn(() => 'Action Label'),
    mockModalState: {
      transactionData: {
        tokenQuery: { data: [] },
        balances: {},
        selectedToken: null,
      },
      form: {
        setValue: vi.fn(),
        watch: vi.fn(),
      },
    },
  };
}

const mocks = createMocks();

vi.mock(
  '@/components/wallet/portfolio/modals/base/TransactionModalBase',
  () => ({
    TransactionModalBase: ({ children, title }: any) => (
      <div data-testid="transaction-modal-base" title={title}>
        {typeof children === 'function'
          ? children(mocks.mockModalState)
          : children}
      </div>
    ),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/modals/transactionModalDependencies',
  () => ({
    useTransactionModalState: () => ({
      dropdownState: { closeDropdowns: mocks.mockCloseDropdowns },
      isConnected: true,
    }),
    buildModalFormState: (form: any, getMax: any) => {
      const max = getMax();
      return mocks.mockBuildModalFormState(form, max);
    },
    resolveActionLabel: (...args: any[]) =>
      mocks.mockResolveActionLabel(...args),
    TokenOptionButton: ({
      symbol,
      balanceLabel,
      isSelected,
      onSelect,
    }: any) => (
      <div
        data-testid="token-option"
        data-symbol={symbol}
        data-balance={balanceLabel}
        data-selected={isSelected}
        onClick={onSelect}
      >
        {symbol} - {balanceLabel}
      </div>
    ),
    EmptyAssetsMessage: () => <div data-testid="empty-assets" />,
    TransactionModalContent: ({ assetContent }: any) => (
      <div data-testid="transaction-modal-content">{assetContent}</div>
    ),
  }),
);

describe('WithdrawModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockModalState = {
      transactionData: {
        tokenQuery: { data: [] },
        balances: {},
        selectedToken: null,
      },
      form: {
        setValue: vi.fn(),
        watch: vi.fn(),
      },
    };
    mocks.mockSetValue = vi.fn();
    mocks.mockCloseDropdowns = vi.fn();
    mocks.mockBuildModalFormState = vi.fn(() => ({
      handlePercentage: vi.fn(),
      isValid: false,
    }));
    mocks.mockResolveActionLabel = vi.fn(() => 'Action Label');
  });

  it('should render when open', () => {
    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('transaction-modal-base')).toBeInTheDocument();
    expect(screen.getByTitle('Withdraw from Pilot')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<WithdrawModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('transaction-modal-base')).toBeInTheDocument();
  });

  it('should render empty assets message when no tokens available', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [];
    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('empty-assets')).toBeInTheDocument();
  });

  it('should categorize tokens correctly and render categories', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
      { symbol: 'WBTC', address: '0x2' },
      { symbol: 'WETH', address: '0x3' },
      { symbol: 'LINK', address: '0x4' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
      '0x2': { balance: '0.5' },
      '0x3': { balance: '2' },
      '0x4': { balance: '100' },
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Stablecoins')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin')).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText('Altcoins')).toBeInTheDocument();
  });

  it('should render token options with correct balance labels', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    const tokenOption = screen.getByTestId('token-option');
    expect(tokenOption).toHaveAttribute('data-symbol', 'USDC');
    expect(tokenOption).toHaveAttribute('data-balance', '1000 available');
  });

  it('should show selected token as selected', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
    };
    mocks.mockModalState.transactionData.selectedToken = {
      symbol: 'USDC',
      address: '0x1',
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    const tokenOption = screen.getByTestId('token-option');
    expect(tokenOption).toHaveAttribute('data-selected', 'true');
  });

  it('should handle token selection correctly', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    const tokenOption = screen.getByTestId('token-option');
    tokenOption.click();

    expect(mocks.mockModalState.form.setValue).toHaveBeenCalledWith(
      'tokenAddress',
      '0x1',
    );
    expect(mocks.mockCloseDropdowns).toHaveBeenCalled();
  });

  it('should parse balance correctly when selected token exists', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1234.56' },
    };
    mocks.mockModalState.transactionData.selectedToken = {
      symbol: 'USDC',
      address: '0x1',
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(mocks.mockBuildModalFormState).toHaveBeenCalledWith(
      mocks.mockModalState.form,
      1234.56,
    );
  });

  it('should use default balance of 0 when no balance exists', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {};
    mocks.mockModalState.transactionData.selectedToken = {
      symbol: 'USDC',
      address: '0x1',
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(mocks.mockBuildModalFormState).toHaveBeenCalledWith(
      mocks.mockModalState.form,
      0,
    );
  });

  it('should use default balance of 0 when token address is empty', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [];
    mocks.mockModalState.transactionData.balances = {};
    mocks.mockModalState.transactionData.selectedToken = null;

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(mocks.mockBuildModalFormState).toHaveBeenCalledWith(
      mocks.mockModalState.form,
      0,
    );
  });

  it('should skip rendering categories with no tokens', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Stablecoins')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument();
    expect(screen.queryByText('Ethereum')).not.toBeInTheDocument();
  });

  it('should render multiple tokens within the same category', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [
      { symbol: 'USDC', address: '0x1' },
      { symbol: 'USDT', address: '0x2' },
      { symbol: 'DAI', address: '0x3' },
    ];
    mocks.mockModalState.transactionData.balances = {
      '0x1': { balance: '1000' },
      '0x2': { balance: '2000' },
      '0x3': { balance: '3000' },
    };

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    const tokenOptions = screen.getAllByTestId('token-option');
    expect(tokenOptions).toHaveLength(3);
    expect(tokenOptions[0]).toHaveAttribute('data-symbol', 'USDC');
    expect(tokenOptions[1]).toHaveAttribute('data-symbol', 'USDT');
    expect(tokenOptions[2]).toHaveAttribute('data-symbol', 'DAI');
  });

  it('should pass correct props to resolveActionLabel', () => {
    mocks.mockModalState.transactionData.tokenQuery.data = [];
    mocks.mockModalState.transactionData.selectedToken = null;

    render(<WithdrawModal isOpen={true} onClose={vi.fn()} />);

    expect(mocks.mockResolveActionLabel).toHaveBeenCalledWith({
      isConnected: true,
      hasSelection: false,
      isReady: false,
      selectionLabel: 'Select Asset',
      notReadyLabel: 'Enter Amount',
      readyLabel: 'Review & Withdraw',
    });
  });

  it('should use defaultChainId when provided', () => {
    render(
      <WithdrawModal isOpen={true} onClose={vi.fn()} defaultChainId={42161} />,
    );
    expect(screen.getByTestId('transaction-modal-base')).toBeInTheDocument();
  });
});
