import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WalletCard } from '@/components/WalletManager/components/WalletCard';
import type { WalletData } from '@/lib/validation/walletUtils';
import type { WalletOperations } from '@/types';

vi.mock('framer-motion', async () => {
  const { setupFramerMotionMocks } =
    await import('../../../../utils/framerMotionMocks');

  return setupFramerMotionMocks();
});

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Zap: () => <div data-testid="zap-icon">Zap Icon</div>,
  MoreVertical: () => <div data-testid="more-icon">More Icon</div>,
}));

// Mock LoadingSpinner
vi.mock('@/components/ui', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="loading-spinner" data-size={size}>
      Loading...
    </div>
  ),
}));

// Mock animation variants
vi.mock('@/lib/ui/animationVariants', () => ({
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  },
  SMOOTH_TRANSITION: { duration: 0.3 },
}));

// Mock formatAddress
vi.mock('@/utils/formatters', () => ({
  formatAddress: (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`,
}));

// Mock WalletActionMenu
vi.mock('@/components/WalletManager/components/WalletActionMenu', () => ({
  WalletActionMenu: ({
    wallet,
    isOpen,
    onCopyAddress,
    onEditWallet,
    onDeleteWallet,
  }: any) => (
    <div data-testid="wallet-action-menu" data-wallet-id={wallet.id}>
      {isOpen && <div data-testid="menu-open">Menu Open</div>}
      <button onClick={() => onCopyAddress(wallet.address, wallet.id)}>
        Copy
      </button>
      <button onClick={() => onEditWallet(wallet.id, wallet.label)}>
        Edit
      </button>
      <button onClick={() => onDeleteWallet(wallet.id)}>Delete</button>
    </div>
  ),
}));

describe('WalletCard', () => {
  const mockWallet: WalletData = {
    id: 'wallet1',
    address: '0x1234567890123456789012345678901234567890',
    label: 'Main Wallet',
    isActive: false,
    isMain: false,
    createdAt: '2024-01-01T00:00:00Z',
  };

  const defaultOperations: WalletOperations = {
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    subscribing: { isLoading: false, error: null },
  };

  const defaultProps = {
    wallet: mockWallet,
    operations: defaultOperations,
    isOwner: true,
    onCopyAddress: vi.fn(),
    onEditWallet: vi.fn(),
    onDeleteWallet: vi.fn(),
    openDropdown: null,
    menuPosition: null,
    onToggleDropdown: vi.fn(),
    onCloseDropdown: vi.fn(),
  };

  describe('basic rendering', () => {
    it('should render wallet card', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.getByText('Main Wallet')).toBeInTheDocument();
    });

    it('should display wallet label', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.getByText('Main Wallet')).toBeInTheDocument();
    });

    it('should display formatted wallet address', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.getByText('0x1234...7890')).toBeInTheDocument();
    });

    it('should render action menu', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.getByTestId('wallet-action-menu')).toBeInTheDocument();
    });

    it('should have role article', () => {
      render(<WalletCard {...defaultProps} />);

      const card = screen.getByRole('article');
      expect(card).toBeInTheDocument();
    });

    it('should have aria-label with wallet label', () => {
      render(<WalletCard {...defaultProps} />);

      const card = screen.getByLabelText('Wallet Main Wallet');
      expect(card).toBeInTheDocument();
    });
  });

  describe('active wallet badge', () => {
    it('should show active badge when wallet is active', () => {
      const activeWallet = { ...mockWallet, isActive: true };

      render(<WalletCard {...defaultProps} wallet={activeWallet} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should display Zap icon in active badge', () => {
      const activeWallet = { ...mockWallet, isActive: true };

      render(<WalletCard {...defaultProps} wallet={activeWallet} />);

      expect(screen.getByTestId('zap-icon')).toBeInTheDocument();
    });

    it('should not show active badge for inactive wallets', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('should have role status for active badge', () => {
      const activeWallet = { ...mockWallet, isActive: true };

      render(<WalletCard {...defaultProps} wallet={activeWallet} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Active');
    });

    it('should have purple styling for active wallet', () => {
      const activeWallet = { ...mockWallet, isActive: true };

      const { container } = render(
        <WalletCard {...defaultProps} wallet={activeWallet} />,
      );

      const card = container.querySelector('[role="article"]');
      expect(card?.className).toContain('border-purple-500/50');
      expect(card?.className).toContain('bg-purple-500/10');
    });

    it('should have glass-morphism for inactive wallet', () => {
      const { container } = render(<WalletCard {...defaultProps} />);

      const card = container.querySelector('[role="article"]');
      expect(card?.className).toContain('glass-morphism');
      expect(card?.className).toContain('border-gray-700');
    });
  });

  describe('loading states', () => {
    it('should show editing loading spinner', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        editing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should show removing loading spinner', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should show Updating text for editing', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        editing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Updating...')).toBeInTheDocument();
    });

    it('should show Removing text for removing', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Removing...')).toBeInTheDocument();
    });

    it('should not show loading spinner when operations not in progress', () => {
      render(<WalletCard {...defaultProps} />);

      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('should display removing error', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet1: { isLoading: false, error: 'Failed to remove wallet' },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Failed to remove wallet')).toBeInTheDocument();
    });

    it('should display editing error', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        editing: {
          wallet1: { isLoading: false, error: 'Failed to update label' },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Failed to update label')).toBeInTheDocument();
    });

    it('should prioritize removing error when both errors exist', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet1: { isLoading: false, error: 'Remove error' },
        },
        editing: {
          wallet1: { isLoading: false, error: 'Edit error' },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Remove error')).toBeInTheDocument();
    });

    it('should not show error box when no errors', () => {
      render(<WalletCard {...defaultProps} />);

      const errorBox = screen.queryByText(/failed/i);
      expect(errorBox).not.toBeInTheDocument();
    });

    it('should have red styling for error box', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet1: { isLoading: false, error: 'Test error' },
        },
      };

      const { container } = render(
        <WalletCard {...defaultProps} operations={operations} />,
      );

      const errorBox = container.querySelector('.bg-red-600\\/10');
      expect(errorBox).toBeInTheDocument();
    });
  });

  describe('action menu integration', () => {
    it('should pass wallet to action menu', () => {
      render(<WalletCard {...defaultProps} />);

      const menu = screen.getByTestId('wallet-action-menu');
      expect(menu).toHaveAttribute('data-wallet-id', 'wallet1');
    });

    it('should show menu as open when openDropdown matches wallet id', () => {
      render(<WalletCard {...defaultProps} openDropdown="wallet1" />);

      expect(screen.getByTestId('menu-open')).toBeInTheDocument();
    });

    it('should not show menu as open when openDropdown is different', () => {
      render(<WalletCard {...defaultProps} openDropdown="wallet2" />);

      expect(screen.queryByTestId('menu-open')).not.toBeInTheDocument();
    });

    it('should call onCopyAddress when copy clicked', async () => {
      const user = userEvent.setup();
      const onCopyAddress = vi.fn();

      render(<WalletCard {...defaultProps} onCopyAddress={onCopyAddress} />);

      await user.click(screen.getByText('Copy'));

      expect(onCopyAddress).toHaveBeenCalledWith(
        mockWallet.address,
        mockWallet.id,
      );
    });

    it('should call onEditWallet when edit clicked', async () => {
      const user = userEvent.setup();
      const onEditWallet = vi.fn();

      render(<WalletCard {...defaultProps} onEditWallet={onEditWallet} />);

      await user.click(screen.getByText('Edit'));

      expect(onEditWallet).toHaveBeenCalledWith(
        mockWallet.id,
        mockWallet.label,
      );
    });

    it('should call onDeleteWallet when delete clicked', async () => {
      const user = userEvent.setup();
      const onDeleteWallet = vi.fn();

      render(<WalletCard {...defaultProps} onDeleteWallet={onDeleteWallet} />);

      await user.click(screen.getByText('Delete'));

      expect(onDeleteWallet).toHaveBeenCalledWith(mockWallet.id);
    });
  });

  describe('different wallet data', () => {
    it('should display different wallet labels', () => {
      const wallet = { ...mockWallet, label: 'Trading Wallet' };

      render(<WalletCard {...defaultProps} wallet={wallet} />);

      expect(screen.getByText('Trading Wallet')).toBeInTheDocument();
    });

    it('should display different wallet addresses', () => {
      const wallet = {
        ...mockWallet,
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      };

      render(<WalletCard {...defaultProps} wallet={wallet} />);

      expect(screen.getByText('0xabcd...abcd')).toBeInTheDocument();
    });

    it('should handle long wallet labels', () => {
      const wallet = { ...mockWallet, label: 'A'.repeat(100) };

      render(<WalletCard {...defaultProps} wallet={wallet} />);

      const label = screen.getByText('A'.repeat(100));
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('truncate');
    });

    it('should handle different wallet IDs', () => {
      const wallet = { ...mockWallet, id: 'wallet999' };

      render(<WalletCard {...defaultProps} wallet={wallet} />);

      const menu = screen.getByTestId('wallet-action-menu');
      expect(menu).toHaveAttribute('data-wallet-id', 'wallet999');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined onSwitchWallet', () => {
      render(<WalletCard {...defaultProps} onSwitchWallet={undefined} />);

      expect(
        screen.queryByRole('button', { name: /switch/i }),
      ).not.toBeInTheDocument();
    });

    it('should handle null menuPosition', () => {
      render(<WalletCard {...defaultProps} menuPosition={null} />);

      expect(screen.getByTestId('wallet-action-menu')).toBeInTheDocument();
    });

    it('should handle null openDropdown', () => {
      render(<WalletCard {...defaultProps} openDropdown={null} />);

      expect(screen.queryByTestId('menu-open')).not.toBeInTheDocument();
    });

    it('should handle empty operations object', () => {
      const operations: WalletOperations = {
        adding: { isLoading: false, error: null },
        removing: {},
        editing: {},
        subscribing: { isLoading: false, error: null },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      expect(screen.getByText('Main Wallet')).toBeInTheDocument();
    });

    it('should handle operations for different wallet IDs', () => {
      const operations: WalletOperations = {
        ...defaultOperations,
        removing: {
          wallet2: { isLoading: true, error: null },
        },
      };

      render(<WalletCard {...defaultProps} operations={operations} />);

      // Should not show loading spinner for wallet1
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  describe('memo optimization', () => {
    it('should have displayName set', () => {
      expect(WalletCard.displayName).toBe('WalletCard');
    });
  });
});
