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
const mockConnectAsync = vi.fn();
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
    mockUseConnectors.mockReturnValue([
      { id: 'injected', uid: 'legacy-injected', name: 'Injected' },
      { id: 'io.rabby', uid: 'rabby-uid', name: 'Rabby' },
      { id: 'io.metamask', uid: 'metamask-uid', name: 'MetaMask' },
    ]);
    mockUseConnect.mockReturnValue({
      mutate: mockConnect,
      mutateAsync: mockConnectAsync,
      isPending: false,
      variables: undefined,
      error: null,
    });
    mockConnectAsync.mockResolvedValue(undefined);
  });

  it('renders connect button when not connected', () => {
    render(<ConnectWalletButton />);

    expect(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    ).toBeInTheDocument();
  });

  it('opens wallet picker instead of connecting the first connector on click', () => {
    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: WALLET_LABELS.SELECT_WALLET_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rabby/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /MetaMask/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Injected/ }),
    ).not.toBeInTheDocument();
  });

  it('connects the selected wallet from the picker', async () => {
    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Rabby/ }));

    expect(mockConnectAsync).toHaveBeenCalledWith({
      connector: { id: 'io.rabby', uid: 'rabby-uid', name: 'Rabby' },
    });
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
      mutateAsync: mockConnectAsync,
      isPending: false,
      variables: undefined,
      error: null,
    });

    render(<ConnectWalletButton />);

    fireEvent.click(
      screen.getByRole('button', { name: WALLET_LABELS.CONNECT }),
    );

    expect(mockConnect).not.toHaveBeenCalled();
    expect(
      screen.getByText(WALLET_LABELS.NO_WALLET_DETECTED),
    ).toBeInTheDocument();
    expect(
      screen.getByText(WALLET_LABELS.INSTALL_WALLET_CTA),
    ).toBeInTheDocument();
  });
});
