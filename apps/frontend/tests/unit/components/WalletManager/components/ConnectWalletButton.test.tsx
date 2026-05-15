/**
 * ConnectWalletButton Unit Tests
 *
 * Tests for the wagmi-based connect wallet button.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectWalletButton } from '@/components/WalletManager/components/ConnectWalletButton';
import { WALLET_LABELS } from '@/constants/wallet';

// Mock wagmi hooks
const mockConnect = vi.fn();
const mockUseConnection = vi.fn();
const mockUseConnect = vi.fn();
const mockUseConnectors = vi.fn();

vi.mock('wagmi', () => ({
  useConnection: () => mockUseConnection(),
  useConnect: () => mockUseConnect(),
  useConnectors: () => mockUseConnectors(),
}));

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: disconnected state
    mockUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    mockUseConnectors.mockReturnValue([{ id: 'injected', name: 'MetaMask' }]);
    mockUseConnect.mockReturnValue({
      mutate: mockConnect,
      isPending: false,
    });
  });

  it('renders connect button when not connected', () => {
    render(<ConnectWalletButton />);

    expect(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    ).toBeInTheDocument();
  });

  it('calls connect with first connector on click', () => {
    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).toHaveBeenCalledWith({
      connector: { id: 'injected', name: 'MetaMask' },
    });
  });

  it("shows 'Connecting...' when connection is pending", () => {
    mockUseConnect.mockReturnValue({
      mutate: mockConnect,
      isPending: true,
    });

    render(<ConnectWalletButton />);

    expect(
      screen.getByRole('button', { name: 'Connecting...' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connecting...' }),
    ).toBeDisabled();
  });

  it('shows shortened address when connected', () => {
    mockUseConnection.mockReturnValue({
      address: '0x1234567890abcdef1234567890abcdef12345678',
      isConnected: true,
    });

    render(<ConnectWalletButton />);

    expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ConnectWalletButton className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('does not call connect when no connectors available', () => {
    mockUseConnectors.mockReturnValue([]);
    mockUseConnect.mockReturnValue({
      mutate: mockConnect,
      isPending: false,
    });

    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).not.toHaveBeenCalled();
  });
});
