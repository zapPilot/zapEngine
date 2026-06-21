import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalletMenu } from '@/components/wallet/portfolio/components/navigation/WalletMenu';
import { WALLET_LABELS } from '@/constants/wallet';

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

function createMockWalletProvider(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    account: null,
    isConnected: false,
    isConnecting: false,
    connect: mockConnect,
    disconnect: mockDisconnect,
    ...overrides,
  };
}

let mockWalletProviderState = createMockWalletProvider();

async function flushMenuAction(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: () => mockWalletProviderState,
}));

vi.mock('@/utils/formatters', () => ({
  formatAddress: (addr: string) =>
    `${addr.substring(0, 6)}...${addr.slice(-4)}`,
}));

vi.mock('@/components/WalletManager/components/CreateZapWalletButton', () => ({
  CreateZapWalletButton: ({ className }: { className?: string }) => (
    <button className={className} data-testid="create-zap-wallet-btn">
      Create Zap Wallet
    </button>
  ),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(() => Promise.resolve()),
};
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
  configurable: true,
});

describe('WalletMenu Component', () => {
  const mockOnOpenSettings = vi.fn();
  const mockOnOpenWalletManager = vi.fn();

  const mockAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const mockAddress2 = '0xabcdef1234567890abcdef1234567890abcdef12';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWalletProviderState = createMockWalletProvider();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Disconnected State', () => {
    it('renders the Create Zap Wallet label when disconnected', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);

      const label = screen.getByText(WALLET_LABELS.CREATE_ZAP_WALLET);
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('hidden', 'sm:inline');
    });

    it('renders wallet icon always', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');
      expect(button).toBeInTheDocument();
    });

    it('triggers Privy connect when the disconnected button is clicked', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');
      fireEvent.click(button);

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByTestId('unified-wallet-menu-dropdown'),
      ).not.toBeInTheDocument();
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('matches snapshot - disconnected state', () => {
      const { container } = render(
        <WalletMenu onOpenSettings={mockOnOpenSettings} />,
      );
      expect(container).toMatchSnapshot();
    });
  });

  describe('Connected State - Single Wallet', () => {
    beforeEach(() => {
      mockWalletProviderState = createMockWalletProvider({
        isConnected: true,
        account: { address: mockAddress },
      });
    });

    it('displays formatted wallet address when connected', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      // formatAddress mocked to return first 6 chars + ... + last 4
      expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
    });

    it('opens dropdown menu when clicked while connected', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');

      fireEvent.click(button);

      expect(
        screen.getByTestId('unified-wallet-menu-dropdown'),
      ).toBeInTheDocument();
    });

    it('shows View Bundles button when onOpenWalletManager is provided', () => {
      render(
        <WalletMenu
          onOpenSettings={mockOnOpenSettings}
          onOpenWalletManager={mockOnOpenWalletManager}
        />,
      );
      const button = screen.getByTestId('unified-wallet-menu-button');
      fireEvent.click(button);

      expect(screen.getByText('View Bundles')).toBeInTheDocument();
    });

    it('calls onOpenWalletManager when View Bundles is clicked', () => {
      render(
        <WalletMenu
          onOpenSettings={mockOnOpenSettings}
          onOpenWalletManager={mockOnOpenWalletManager}
        />,
      );
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));
      fireEvent.click(screen.getByText('View Bundles'));

      expect(mockOnOpenWalletManager).toHaveBeenCalled();
    });

    it('calls onOpenSettings when Settings is clicked', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));
      fireEvent.click(screen.getByText('Settings'));

      expect(mockOnOpenSettings).toHaveBeenCalled();
    });

    it('closes menu after clicking a menu item', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');
      fireEvent.click(button);

      // Menu is open
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(screen.getByText('Settings'));

      // Menu should be closed (verified via aria-expanded as AnimatePresence keeps element during animation)
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('copies address to clipboard when copy button is clicked', async () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));

      const copyButton = screen.getByText('Copy');
      await flushMenuAction(() => {
        fireEvent.click(copyButton);
      });

      // Mock clipboard resolves immediately
      expect(mockClipboard.writeText).toHaveBeenCalledWith(mockAddress);
    });

    it("shows 'Copied' feedback immediately after clicking copy", async () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));

      const copyButton = screen.getByText('Copy');
      await flushMenuAction(() => {
        fireEvent.click(copyButton);
      });

      expect(screen.getByText('Copied')).toBeInTheDocument();
    });

    it('calls disconnect when Disconnect button is clicked', async () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));

      const disconnectButton = screen.getByText('Disconnect');
      await flushMenuAction(() => {
        fireEvent.click(disconnectButton);
      });

      // Mock disconnect resolves immediately
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('matches snapshot - single wallet connected', () => {
      const { container } = render(
        <WalletMenu
          onOpenSettings={mockOnOpenSettings}
          onOpenWalletManager={mockOnOpenWalletManager}
        />,
      );
      // Click to open the dropdown for full snapshot
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));
      expect(container).toMatchSnapshot();
    });
  });

  describe('Menu Interactions', () => {
    beforeEach(() => {
      mockWalletProviderState = createMockWalletProvider({
        isConnected: true,
        account: { address: mockAddress },
      });
    });

    it('closes menu when clicking outside', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');
      fireEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');

      // Simulate click outside
      fireEvent.mouseDown(document.body);

      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes menu when Escape key is pressed', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');
      fireEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles menu open/closed on repeated button clicks', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');

      // Initial state - closed
      expect(button).toHaveAttribute('aria-expanded', 'false');

      // First click - opens
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      // Second click - closes
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('has correct aria-expanded attribute', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      const button = screen.getByTestId('unified-wallet-menu-button');

      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('dropdown has correct role and aria-label', () => {
      render(<WalletMenu onOpenSettings={mockOnOpenSettings} />);
      fireEvent.click(screen.getByTestId('unified-wallet-menu-button'));

      const dropdown = screen.getByTestId('unified-wallet-menu-dropdown');
      expect(dropdown).toHaveAttribute('role', 'menu');
      expect(dropdown).toHaveAttribute('aria-label', 'Wallet menu');
    });
  });
});
