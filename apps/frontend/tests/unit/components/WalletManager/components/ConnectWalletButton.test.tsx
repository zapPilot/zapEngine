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
const mockOpenConnectModal = vi.fn();
const mockUseConnection = vi.fn();

vi.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => ({
    openConnectModal: mockOpenConnectModal,
  }),
}));

vi.mock('wagmi', () => ({
  useConnection: () => mockUseConnection(),
}));

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: disconnected state
    mockUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      isConnecting: false,
    });
  });

  it('renders connect button when not connected', () => {
    render(<ConnectWalletButton />);

    expect(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    ).toBeInTheDocument();
  });

  it('keeps the compact gradient connect button shell', () => {
    render(<ConnectWalletButton />);

    const button = screen.getByRole('button', {
      name: WALLET_LABELS.CONNECT,
    });

    expect(button).toHaveClass(
      'w-full',
      'rounded-xl',
      'font-semibold',
      'text-white',
    );
    expect(button).toHaveStyle({
      background:
        'linear-gradient(135deg, rgb(168 85 247) 0%, rgb(124 58 237) 100%)',
      border: '1px solid rgba(168, 85, 247, 0.3)',
    });
  });

  it('opens the RainbowKit connect modal instead of rendering a custom picker', () => {
    render(<ConnectWalletButton />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockOpenConnectModal).toHaveBeenCalledTimes(1);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.queryByText('Choose Wallet')).not.toBeInTheDocument();
  });

  it('opens the RainbowKit connect modal on repeated disconnected clicks', () => {
    render(<ConnectWalletButton />);

    const button = screen.getByRole('button', { name: WALLET_LABELS.CONNECT });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mockOpenConnectModal).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("shows 'Connecting...' when connection is pending", () => {
    mockUseConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      isConnecting: true,
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
      isConnecting: false,
    });

    render(<ConnectWalletButton />);

    const connectedButton = screen.getByRole('button', {
      name: '0x1234...5678',
    });
    expect(connectedButton).toBeInTheDocument();
    expect(connectedButton).toBeDisabled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ConnectWalletButton className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
