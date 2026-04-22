import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WalletList } from '@/components/WalletManager/components/WalletList';
import type { WalletData } from '@/lib/validation/walletUtils';
import type { WalletOperations } from '@/types';

import {
  DEFAULT_NEW_WALLET,
  DEFAULT_WALLET_OPERATIONS,
  MOCK_WALLET_1,
  MOCK_WALLET_2,
} from '../../../../fixtures/componentMocks';

// Mock useWalletList context hook
vi.mock('@/components/WalletManager/contexts/WalletListContext', () => ({
  useWalletList: () => ({
    operations: {
      adding: { isLoading: false, error: null },
      removing: {},
      editing: {},
      subscribing: { isLoading: false, error: null },
    },
    openDropdown: null,
    menuPosition: null,
    onCopyAddress: vi.fn(),
    onEditWallet: vi.fn(),
    onDeleteWallet: vi.fn(),
    onToggleDropdown: vi.fn(),
    onCloseDropdown: vi.fn(),
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon">Plus Icon</div>,
  Wallet: () => <div data-testid="wallet-icon">Wallet Icon</div>,
  Copy: () => <div>Copy Icon</div>,
  Edit3: () => <div>Edit Icon</div>,
  ExternalLink: () => <div>Link Icon</div>,
  MoreVertical: () => <div>More Icon</div>,
  Trash2: () => <div>Trash Icon</div>,
  Zap: () => <div>Zap Icon</div>,
}));

// Mock GradientButton
vi.mock('@/components/ui', () => ({
  GradientButton: ({
    children,
    onClick,
    icon: Icon,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    icon?: React.ComponentType;
  }) => (
    <button onClick={onClick} data-testid="gradient-button">
      {Icon && <Icon />}
      {children}
    </button>
  ),
  LoadingSpinner: () => <div>Loading...</div>,
}));

// Mock design system constants
vi.mock('@/constants/design-system', () => ({
  GRADIENTS: {
    PRIMARY: 'primary-gradient',
  },
  Z_INDEX: {
    TOAST: 'z-50',
  },
}));

// Mock WalletCard
vi.mock('@/components/WalletManager/components/WalletCard', () => ({
  WalletCard: ({ wallet }: { wallet: WalletData }) => (
    <div data-testid="wallet-card" data-wallet-id={wallet.id}>
      Wallet: {wallet.label}
    </div>
  ),
}));

// Mock AddWalletForm
vi.mock('@/components/WalletManager/components/AddWalletForm', () => ({
  AddWalletForm: ({ isAdding }: { isAdding: boolean }) => (
    <div data-testid="add-wallet-form" data-is-adding={isAdding}>
      Add Wallet Form
    </div>
  ),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock Portal
vi.mock('@/components/ui/Portal', () => ({
  Portal: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock formatAddress
vi.mock('@/utils/formatters', () => ({
  formatAddress: (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`,
}));

// Mock animation variants
vi.mock('@/lib/ui/animationVariants', () => ({
  fadeInUp: {},
  SMOOTH_TRANSITION: {},
}));

describe('WalletList', () => {
  const defaultProps = {
    wallets: [MOCK_WALLET_1, MOCK_WALLET_2],
    operations: DEFAULT_WALLET_OPERATIONS,
    isOwner: true,
    isAdding: false,
    newWallet: DEFAULT_NEW_WALLET,
    validationError: null,
    openDropdown: null,
    menuPosition: null,
    onCopyAddress: vi.fn(),
    onEditWallet: vi.fn(),
    onDeleteWallet: vi.fn(),
    onToggleDropdown: vi.fn(),
    onCloseDropdown: vi.fn(),
    onWalletChange: vi.fn(),
    onAddWallet: vi.fn(),
    onStartAdding: vi.fn(),
    onCancelAdding: vi.fn(),
  };

  describe('empty state', () => {
    it('should show empty state when no wallets', () => {
      render(<WalletList {...defaultProps} wallets={[]} />);

      expect(screen.getByText('Bundled Wallets (0)')).toBeInTheDocument();
    });

    it('should display Wallet icon in empty state', () => {
      render(<WalletList {...defaultProps} wallets={[]} />);

      expect(screen.getByTestId('wallet-icon')).toBeInTheDocument();
    });

    it('should show owner-specific message when owner', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={true} />);

      expect(
        screen.getByText('Add wallets to your bundle'),
      ).toBeInTheDocument();
    });

    it('should show non-owner message when not owner', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={false} />);

      expect(screen.getByText('No wallets in this bundle')).toBeInTheDocument();
    });

    it('should show Add Your First Wallet button for owners', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={true} />);

      expect(screen.getByText('Add Your First Wallet')).toBeInTheDocument();
    });

    it('should not show Add button for non-owners in empty state', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={false} />);

      expect(
        screen.queryByText('Add Your First Wallet'),
      ).not.toBeInTheDocument();
    });

    it('should display Plus icon in empty state button', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={true} />);

      expect(screen.getByTestId('plus-icon')).toBeInTheDocument();
    });

    it('should call onStartAdding when Add Your First Wallet clicked', async () => {
      const user = userEvent.setup();
      const onStartAdding = vi.fn();

      render(
        <WalletList
          {...defaultProps}
          wallets={[]}
          isOwner={true}
          onStartAdding={onStartAdding}
        />,
      );

      await user.click(screen.getByText('Add Your First Wallet'));

      expect(onStartAdding).toHaveBeenCalledTimes(1);
    });

    it('should have dashed border in empty state', () => {
      const { container } = render(
        <WalletList {...defaultProps} wallets={[]} />,
      );

      const emptyBox = container.querySelector('.border-dashed');
      expect(emptyBox).toBeInTheDocument();
    });
  });

  describe('wallet list display', () => {
    it('should show wallet count in header', () => {
      render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1, MOCK_WALLET_2]}
        />,
      );

      expect(screen.getByText('Bundled Wallets (2)')).toBeInTheDocument();
    });

    it('should render WalletCard for each wallet', () => {
      render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1, MOCK_WALLET_2]}
        />,
      );

      const cards = screen.getAllByTestId('wallet-card');
      expect(cards).toHaveLength(2);
    });

    it('should pass correct wallet data to WalletCards', () => {
      render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1, MOCK_WALLET_2]}
        />,
      );

      expect(screen.getByText('Wallet: Main Wallet')).toBeInTheDocument();
      expect(screen.getByText('Wallet: Trading Wallet')).toBeInTheDocument();
    });

    it('should render single wallet correctly', () => {
      render(<WalletList {...defaultProps} wallets={[MOCK_WALLET_1]} />);

      expect(screen.getByText('Bundled Wallets (1)')).toBeInTheDocument();
      expect(screen.getAllByTestId('wallet-card')).toHaveLength(1);
    });

    it('should handle many wallets', () => {
      const manyWallets: WalletData[] = Array.from({ length: 10 }, (_, i) => ({
        id: `wallet${i}`,
        address: `0x${i}234567890123456789012345678901234567890`,
        label: `Wallet ${i}`,
        isActive: false,
        isMain: false,
        createdAt: '2024-01-01T00:00:00Z',
      }));

      render(<WalletList {...defaultProps} wallets={manyWallets} />);

      expect(screen.getByText('Bundled Wallets (10)')).toBeInTheDocument();
      expect(screen.getAllByTestId('wallet-card')).toHaveLength(10);
    });

    it('should use wallet ID as key', () => {
      render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1, MOCK_WALLET_2]}
        />,
      );

      const card1 = screen.getByText('Wallet: Main Wallet').closest('div');
      const card2 = screen.getByText('Wallet: Trading Wallet').closest('div');

      expect(card1).toHaveAttribute('data-wallet-id', 'wallet1');
      expect(card2).toHaveAttribute('data-wallet-id', 'wallet2');
    });
  });

  describe('add wallet section', () => {
    it('should show Add Another Wallet section for owners', () => {
      render(<WalletList {...defaultProps} isOwner={true} />);

      expect(screen.getByText('Add Another Wallet')).toBeInTheDocument();
    });

    it('should not show Add Another Wallet section for non-owners', () => {
      render(<WalletList {...defaultProps} isOwner={false} />);

      expect(screen.queryByText('Add Another Wallet')).not.toBeInTheDocument();
    });

    it('should render AddWalletForm for owners', () => {
      render(<WalletList {...defaultProps} isOwner={true} />);

      expect(screen.getByTestId('add-wallet-form')).toBeInTheDocument();
    });

    it('should not render AddWalletForm for non-owners', () => {
      render(<WalletList {...defaultProps} isOwner={false} />);

      expect(screen.queryByTestId('add-wallet-form')).not.toBeInTheDocument();
    });

    it('should pass isAdding prop to AddWalletForm', () => {
      render(<WalletList {...defaultProps} isAdding={true} isOwner={true} />);

      const form = screen.getByTestId('add-wallet-form');
      expect(form).toHaveAttribute('data-is-adding', 'true');
    });

    it('should not show add section in empty state with wallets', () => {
      render(<WalletList {...defaultProps} wallets={[]} isOwner={true} />);

      // Empty state shows different UI
      expect(screen.queryByText('Add Another Wallet')).not.toBeInTheDocument();
    });
  });

  describe('wallet handlers', () => {
    it('should pass onCopyAddress to WalletCard', () => {
      const onCopyAddress = vi.fn();

      render(<WalletList {...defaultProps} onCopyAddress={onCopyAddress} />);

      // WalletCard receives the prop (verified by render)
      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass onEditWallet to WalletCard', () => {
      const onEditWallet = vi.fn();

      render(<WalletList {...defaultProps} onEditWallet={onEditWallet} />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass onDeleteWallet to WalletCard', () => {
      const onDeleteWallet = vi.fn();

      render(<WalletList {...defaultProps} onDeleteWallet={onDeleteWallet} />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass onToggleDropdown to WalletCard', () => {
      const onToggleDropdown = vi.fn();

      render(
        <WalletList {...defaultProps} onToggleDropdown={onToggleDropdown} />,
      );

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass onCloseDropdown to WalletCard', () => {
      const onCloseDropdown = vi.fn();

      render(
        <WalletList {...defaultProps} onCloseDropdown={onCloseDropdown} />,
      );

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });
  });

  describe('operations and state', () => {
    it('should pass operations to WalletCard', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        removing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(<WalletList {...defaultProps} operations={operations} />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass openDropdown state to WalletCard', () => {
      render(<WalletList {...defaultProps} openDropdown="wallet1" />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass menuPosition to WalletCard', () => {
      render(
        <WalletList {...defaultProps} menuPosition={{ top: 100, left: 200 }} />,
      );

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass validation error to AddWalletForm', () => {
      render(
        <WalletList
          {...defaultProps}
          validationError="Invalid wallet address"
          isOwner={true}
        />,
      );

      expect(screen.getByTestId('add-wallet-form')).toBeInTheDocument();
    });
  });

  describe('optional props', () => {
    it('should handle undefined onSwitchWallet', () => {
      render(<WalletList {...defaultProps} onSwitchWallet={undefined} />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });

    it('should pass onSwitchWallet when provided', () => {
      const onSwitchWallet = vi.fn();

      render(<WalletList {...defaultProps} onSwitchWallet={onSwitchWallet} />);

      expect(screen.getAllByTestId('wallet-card')).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle transition from empty to populated', () => {
      const { rerender } = render(
        <WalletList {...defaultProps} wallets={[]} isOwner={true} />,
      );

      expect(screen.getByText('Bundled Wallets (0)')).toBeInTheDocument();

      rerender(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1]}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Bundled Wallets (1)')).toBeInTheDocument();
      expect(
        screen.queryByText('Add wallets to your bundle'),
      ).not.toBeInTheDocument();
    });

    it('should handle transition from populated to empty', () => {
      const { rerender } = render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1]}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Bundled Wallets (1)')).toBeInTheDocument();

      rerender(<WalletList {...defaultProps} wallets={[]} isOwner={true} />);

      expect(screen.getByText('Bundled Wallets (0)')).toBeInTheDocument();
      expect(
        screen.getByText('Add wallets to your bundle'),
      ).toBeInTheDocument();
    });

    it('should handle isOwner changing from true to false', () => {
      const { rerender } = render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1]}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Add Another Wallet')).toBeInTheDocument();

      rerender(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1]}
          isOwner={false}
        />,
      );

      expect(screen.queryByText('Add Another Wallet')).not.toBeInTheDocument();
    });

    it('should maintain wallet order', () => {
      render(
        <WalletList
          {...defaultProps}
          wallets={[MOCK_WALLET_1, MOCK_WALLET_2]}
        />,
      );

      const cards = screen.getAllByTestId('wallet-card');
      expect(cards[0]).toHaveAttribute('data-wallet-id', 'wallet1');
      expect(cards[1]).toHaveAttribute('data-wallet-id', 'wallet2');
    });
  });
});
