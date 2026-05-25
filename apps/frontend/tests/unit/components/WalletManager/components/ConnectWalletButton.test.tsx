/**
 * ConnectWalletButton Unit Tests
 *
 * Tests for the wagmi-based connect wallet button.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      mutateAsync: mockConnect,
      isPending: false,
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

  it('opens connector choices before connecting the selected wallet', () => {
    const connectors = [
      { id: 'io.rabby', name: 'Rabby', icon: 'data:image/svg+xml,<svg />' },
      { id: 'io.metamask', name: 'MetaMask' },
    ];
    mockUseConnectors.mockReturnValue(connectors);

    render(<ConnectWalletButton />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Rabby' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'MetaMask' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('wallet-connector-icon')).toHaveAttribute(
      'src',
      connectors[0].icon,
    );
    expect(
      screen.getByTestId('wallet-connector-fallback-icon'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Choose Wallet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'MetaMask' }));

    expect(mockConnect).toHaveBeenCalledWith({
      connector: connectors[1],
    });
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('toggles the connector picker closed when the connect button is clicked again', () => {
    render(<ConnectWalletButton />);

    const button = screen.getByRole('button', { name: WALLET_LABELS.CONNECT });

    fireEvent.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('closes the connector picker after the selected wallet connects', async () => {
    const connectors = [
      { id: 'io.rabby', name: 'Rabby' },
      { id: 'io.metamask', name: 'MetaMask' },
    ];
    mockUseConnectors.mockReturnValue(connectors);
    mockConnect.mockResolvedValueOnce(undefined);

    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'MetaMask' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(mockConnect).toHaveBeenCalledWith({
      connector: connectors[1],
    });
  });

  it('keeps the connector picker open when the selected wallet fails to connect', async () => {
    const connectors = [
      { id: 'io.rabby', name: 'Rabby' },
      { id: 'io.metamask', name: 'MetaMask' },
    ];
    mockUseConnectors.mockReturnValue(connectors);
    mockConnect.mockRejectedValueOnce(new Error('User rejected request'));

    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'MetaMask' }));

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'MetaMask' }),
    ).toBeInTheDocument();
  });

  it("shows 'Connecting...' when connection is pending", () => {
    mockUseConnect.mockReturnValue({
      mutateAsync: mockConnect,
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

  it('does not call connect when no connectors available', () => {
    mockUseConnectors.mockReturnValue([]);
    mockUseConnect.mockReturnValue({
      mutateAsync: mockConnect,
      isPending: false,
    });

    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).not.toHaveBeenCalled();
    expect(screen.getByText('No wallets detected')).toBeInTheDocument();
  });
});
