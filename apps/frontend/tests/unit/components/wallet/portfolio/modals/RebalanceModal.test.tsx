/**
 * Unit tests for RebalanceModal component
 *
 * Tests rebalance modal with allocation projection visualization
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RebalanceModal } from '@/components/wallet/portfolio/modals/RebalanceModal';

// Mock dependencies
vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: () => ({
    isConnected: true,
  }),
}));

vi.mock('@/services', () => ({
  transactionServiceMock: {
    computeProjectedAllocation: vi.fn((intensity, current, target) => {
      // Simple linear interpolation for testing
      const factor = intensity / 100;
      return {
        crypto: current.crypto + (target.crypto - current.crypto) * factor,
        stable: current.stable + (target.stable - current.stable) * factor,
      };
    }),
    simulateRebalance: vi.fn(() =>
      Promise.resolve({ success: true, txHash: '0x123' }),
    ),
  },
}));

// Mock UI components
vi.mock('@/components/ui/modal', () => ({
  Modal: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  ModalContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="modal-content" className={className}>
      {children}
    </div>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ArrowRight: () => <div data-testid="arrow-right">→</div>,
  Check: () => <div data-testid="check-icon">✓</div>,
}));

// Mock transaction modal components
vi.mock(
  '@/components/wallet/portfolio/modals/components/TransactionModalParts',
  () => ({
    TransactionModalHeader: ({
      title,
      onClose,
    }: {
      title: string;
      onClose: () => void;
    }) => (
      <div data-testid="modal-header">
        <span>{title}</span>
        <button onClick={onClose} data-testid="close-button">
          Close
        </button>
      </div>
    ),
    SubmittingState: ({
      isSuccess,
      successMessage,
    }: {
      isSuccess: boolean;
      successMessage?: string;
    }) => (
      <div data-testid="submitting-state">
        {isSuccess ? successMessage : 'Processing...'}
      </div>
    ),
    TransactionActionButton: ({
      label,
      onClick,
      disabled,
    }: {
      label: string;
      onClick: () => void;
      disabled: boolean;
    }) => (
      <button onClick={onClick} disabled={disabled} data-testid="action-button">
        {label}
      </button>
    ),
  }),
);

vi.mock('@/components/wallet/portfolio/modals/utils/actionLabelUtils', () => ({
  resolveActionLabel: ({
    isConnected,
    isReady,
    readyLabel,
    notReadyLabel,
  }: {
    isConnected: boolean;
    isReady: boolean;
    readyLabel: string;
    notReadyLabel: string;
  }) => {
    if (!isConnected) return 'Connect Wallet';
    return isReady ? readyLabel : notReadyLabel;
  },
}));

describe('RebalanceModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentAllocation: { crypto: 60, stable: 40 },
    targetAllocation: { crypto: 50, stable: 50 },
  };

  it('should not render when isOpen is false', () => {
    render(<RebalanceModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    render(<RebalanceModal {...defaultProps} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('should render modal header with title', () => {
    render(<RebalanceModal {...defaultProps} />);

    expect(screen.getByText('Rebalance Portfolio')).toBeInTheDocument();
  });

  it('should display current allocation', () => {
    render(<RebalanceModal {...defaultProps} />);

    // Current crypto: 60%
    expect(screen.getByText('60')).toBeInTheDocument();
    // Current stable: 40%
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('should display projected allocation', () => {
    render(<RebalanceModal {...defaultProps} />);

    // With intensity at 100, projected should equal target
    // Crypto: 50%, Stable: 50%
    expect(screen.getAllByText('50').length).toBeGreaterThanOrEqual(2);
  });

  it('should render current and projected labels', () => {
    render(<RebalanceModal {...defaultProps} />);

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Projected')).toBeInTheDocument();
  });

  it('should render crypto and stable labels', () => {
    render(<RebalanceModal {...defaultProps} />);

    // Multiple occurrences (current and projected)
    expect(screen.getAllByText('Crypto').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Stable').length).toBeGreaterThanOrEqual(2);
  });

  it('should render arrow between current and projected', () => {
    render(<RebalanceModal {...defaultProps} />);

    expect(screen.getByTestId('arrow-right')).toBeInTheDocument();
  });

  it('should render action button with correct label', () => {
    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Confirm Rebalance');
  });

  it('should enable action button when connected and ready', () => {
    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    expect(button).not.toBeDisabled();
  });

  it('should call transaction service on submit', async () => {
    const { transactionServiceMock } = await import('@/services');
    const simulateRebalanceSpy = vi.spyOn(
      transactionServiceMock,
      'simulateRebalance',
    );

    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(simulateRebalanceSpy).toHaveBeenCalledWith(
        100,
        { crypto: 60, stable: 40 },
        { crypto: 50, stable: 50 },
      );
    });
  });

  it('should show submitting state after submit', async () => {
    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(await screen.findByTestId('submitting-state')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    const onCloseMock = vi.fn();
    render(<RebalanceModal {...defaultProps} onClose={onCloseMock} />);

    const closeButton = screen.getByTestId('close-button');
    fireEvent.click(closeButton);

    // Close is called through resetState
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('should handle different allocation values', () => {
    render(
      <RebalanceModal
        {...defaultProps}
        currentAllocation={{ crypto: 80, stable: 20 }}
        targetAllocation={{ crypto: 30, stable: 70 }}
      />,
    );

    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
  });

  it('should compute projected allocation correctly', async () => {
    const { transactionServiceMock } = await import('@/services');
    const computeSpy = vi.spyOn(
      transactionServiceMock,
      'computeProjectedAllocation',
    );

    render(<RebalanceModal {...defaultProps} />);

    expect(computeSpy).toHaveBeenCalledWith(
      100,
      { crypto: 60, stable: 40 },
      { crypto: 50, stable: 50 },
    );
  });

  it('should handle allocation with decimal values', () => {
    render(
      <RebalanceModal
        {...defaultProps}
        currentAllocation={{ crypto: 55.5, stable: 44.5 }}
        targetAllocation={{ crypto: 50.5, stable: 49.5 }}
      />,
    );

    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('should reset state when modal closes', () => {
    const onCloseMock = vi.fn();
    render(<RebalanceModal {...defaultProps} onClose={onCloseMock} />);

    const closeButton = screen.getByTestId('close-button');
    fireEvent.click(closeButton);

    // Verify close button interaction
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('should handle transaction error gracefully', async () => {
    const { transactionServiceMock } = await import('@/services');
    vi.spyOn(transactionServiceMock, 'simulateRebalance').mockRejectedValueOnce(
      new Error('Network error'),
    );

    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    await act(async () => {
      fireEvent.click(button);
    });

    // Component should handle error and return to idle state
    await waitFor(() => {
      expect(screen.getByTestId('action-button')).toBeInTheDocument();
      expect(screen.queryByTestId('submitting-state')).not.toBeInTheDocument();
    });
  });

  it('should display success message after successful rebalance', async () => {
    const { transactionServiceMock } = await import('@/services');
    vi.spyOn(transactionServiceMock, 'simulateRebalance').mockResolvedValueOnce(
      {
        success: true,
        txHash: '0xABC',
      },
    );

    render(<RebalanceModal {...defaultProps} />);

    const button = screen.getByTestId('action-button');
    await act(async () => {
      fireEvent.click(button);
    });

    // After success, submitting state is shown
    expect(
      await screen.findByText('Rebalance Successfully Executed!'),
    ).toBeInTheDocument();
  });
});
