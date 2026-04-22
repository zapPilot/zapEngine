import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WalletActionMenu } from '@/components/WalletManager/components/WalletActionMenu';
import type { WalletOperations } from '@/types';

import {
  DEFAULT_WALLET_OPERATIONS,
  MOCK_WALLET_1,
} from '../../../../fixtures/componentMocks';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Copy: () => <div data-testid="copy-icon">Copy Icon</div>,
  Edit3: () => <div data-testid="edit-icon">Edit Icon</div>,
  ExternalLink: () => <div data-testid="external-link-icon">Link Icon</div>,
  MoreVertical: () => <div data-testid="more-vertical-icon">More Icon</div>,
  Trash2: () => <div data-testid="trash-icon">Trash Icon</div>,
}));

// Mock Portal component
vi.mock('@/components/ui/Portal', () => ({
  Portal: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="portal">{children}</div>
  ),
}));

// Mock design system constants
vi.mock('@/constants/design-system', () => ({
  Z_INDEX: {
    TOOLTIP: 'z-[9999]',
  },
}));

describe('WalletActionMenu', () => {
  const defaultProps = {
    wallet: MOCK_WALLET_1,
    isOpen: false,
    menuPosition: null,
    operations: DEFAULT_WALLET_OPERATIONS,
    isOwner: true,
    onCopyAddress: vi.fn(),
    onEditWallet: vi.fn(),
    onDeleteWallet: vi.fn(),
    onToggleDropdown: vi.fn(),
    onCloseDropdown: vi.fn(),
  };

  describe('toggle button', () => {
    it('should render toggle button', () => {
      render(<WalletActionMenu {...defaultProps} />);

      const button = screen.getByRole('button', {
        name: /actions for main wallet/i,
      });
      expect(button).toBeInTheDocument();
    });

    it('should display MoreVertical icon', () => {
      render(<WalletActionMenu {...defaultProps} />);

      expect(screen.getByTestId('more-vertical-icon')).toBeInTheDocument();
    });

    it('should have correct aria-label', () => {
      render(<WalletActionMenu {...defaultProps} />);

      const button = screen.getByLabelText('Actions for Main Wallet');
      expect(button).toBeInTheDocument();
    });

    it('should call onToggleDropdown when clicked', async () => {
      const user = userEvent.setup();
      const onToggleDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          onToggleDropdown={onToggleDropdown}
        />,
      );

      const button = screen.getByRole('button', {
        name: /actions for main wallet/i,
      });
      await user.click(button);

      expect(onToggleDropdown).toHaveBeenCalledWith(
        MOCK_WALLET_1.id,
        expect.any(HTMLElement),
      );
    });

    it('should use different aria-label for different wallets', () => {
      const wallet = { ...MOCK_WALLET_1, label: 'Trading Wallet' };

      render(<WalletActionMenu {...defaultProps} wallet={wallet} />);

      const button = screen.getByLabelText('Actions for Trading Wallet');
      expect(button).toBeInTheDocument();
    });
  });

  describe('menu visibility', () => {
    it('should not show menu when isOpen is false', () => {
      render(<WalletActionMenu {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Copy Address')).not.toBeInTheDocument();
    });

    it('should not show menu when menuPosition is null', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={null}
        />,
      );

      expect(screen.queryByText('Copy Address')).not.toBeInTheDocument();
    });

    it('should show menu when isOpen and menuPosition are set', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByText('Copy Address')).toBeInTheDocument();
    });

    it('should render menu in Portal', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByTestId('portal')).toBeInTheDocument();
    });
  });

  describe('menu positioning', () => {
    it('should apply fixed positioning', () => {
      const { container } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      const menu = container.querySelector('.bg-gray-900\\/95');
      expect(menu).toHaveStyle({ position: 'fixed' });
    });

    it('should apply correct top and left values', () => {
      const { container } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 150, left: 250 }}
        />,
      );

      const menu = container.querySelector('.bg-gray-900\\/95');
      expect(menu).toHaveStyle({ top: '150px', left: '250px' });
    });

    it('should handle different menu positions', () => {
      const { container, rerender } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      let menu = container.querySelector('.bg-gray-900\\/95');
      expect(menu).toHaveStyle({ top: '100px', left: '200px' });

      rerender(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 300, left: 400 }}
        />,
      );

      menu = container.querySelector('.bg-gray-900\\/95');
      expect(menu).toHaveStyle({ top: '300px', left: '400px' });
    });
  });

  describe('copy address action', () => {
    it('should render Copy Address option', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByText('Copy Address')).toBeInTheDocument();
    });

    it('should display Copy icon', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByTestId('copy-icon')).toBeInTheDocument();
    });

    it('should call onCopyAddress with correct arguments', async () => {
      const user = userEvent.setup();
      const onCopyAddress = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          onCopyAddress={onCopyAddress}
        />,
      );

      await user.click(screen.getByText('Copy Address'));

      expect(onCopyAddress).toHaveBeenCalledWith(
        MOCK_WALLET_1.address,
        MOCK_WALLET_1.id,
      );
    });

    it('should close dropdown after copying', async () => {
      const user = userEvent.setup();
      const onCloseDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          onCloseDropdown={onCloseDropdown}
        />,
      );

      await user.click(screen.getByText('Copy Address'));

      expect(onCloseDropdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('view on DeBank action', () => {
    it('should render View on DeBank link', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByText('View on DeBank')).toBeInTheDocument();
    });

    it('should display ExternalLink icon', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByTestId('external-link-icon')).toBeInTheDocument();
    });

    it('should have correct href to DeBank profile', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      const link = screen.getByText('View on DeBank').closest('a');
      expect(link).toHaveAttribute(
        'href',
        `https://debank.com/profile/${MOCK_WALLET_1.address}`,
      );
    });

    it('should open in new tab', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      const link = screen.getByText('View on DeBank').closest('a');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should have rel attribute for security', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      const link = screen.getByText('View on DeBank').closest('a');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should close dropdown when clicked', async () => {
      const user = userEvent.setup();
      const onCloseDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          onCloseDropdown={onCloseDropdown}
        />,
      );

      await user.click(screen.getByText('View on DeBank'));

      expect(onCloseDropdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('owner-only actions', () => {
    it('should show Edit and Delete options for owners', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Edit Label')).toBeInTheDocument();
      expect(screen.getByText('Remove from Bundle')).toBeInTheDocument();
    });

    it('should not show Edit and Delete options for non-owners', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={false}
        />,
      );

      expect(screen.queryByText('Edit Label')).not.toBeInTheDocument();
      expect(screen.queryByText('Remove from Bundle')).not.toBeInTheDocument();
    });

    it('should show separator before owner actions', () => {
      const { container } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      const separator = container.querySelector('.border-t.border-gray-700');
      expect(separator).toBeInTheDocument();
    });

    it('should not show separator for non-owners', () => {
      const { container } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={false}
        />,
      );

      const separator = container.querySelector('.border-t.border-gray-700');
      expect(separator).not.toBeInTheDocument();
    });
  });

  describe('edit label action', () => {
    it('should render Edit Label option for owners', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Edit Label')).toBeInTheDocument();
    });

    it('should display Edit3 icon', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      expect(screen.getByTestId('edit-icon')).toBeInTheDocument();
    });

    it('should call onEditWallet with correct arguments', async () => {
      const user = userEvent.setup();
      const onEditWallet = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
          onEditWallet={onEditWallet}
        />,
      );

      await user.click(screen.getByText('Edit Label'));

      expect(onEditWallet).toHaveBeenCalledWith(
        MOCK_WALLET_1.id,
        MOCK_WALLET_1.label,
      );
    });

    it('should close dropdown after editing', async () => {
      const user = userEvent.setup();
      const onCloseDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
          onCloseDropdown={onCloseDropdown}
        />,
      );

      await user.click(screen.getByText('Edit Label'));

      expect(onCloseDropdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove from bundle action', () => {
    it('should render Remove from Bundle option for owners', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      expect(screen.getByText('Remove from Bundle')).toBeInTheDocument();
    });

    it('should display Trash2 icon', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      expect(screen.getByTestId('trash-icon')).toBeInTheDocument();
    });

    it('should have red text styling', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      const button = screen.getByText('Remove from Bundle');
      expect(button).toHaveClass('text-red-400');
    });

    it('should call onDeleteWallet with wallet ID', async () => {
      const user = userEvent.setup();
      const onDeleteWallet = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
          onDeleteWallet={onDeleteWallet}
        />,
      );

      await user.click(screen.getByText('Remove from Bundle'));

      expect(onDeleteWallet).toHaveBeenCalledWith(MOCK_WALLET_1.id);
    });

    it('should close dropdown after deleting', async () => {
      const user = userEvent.setup();
      const onCloseDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
          onCloseDropdown={onCloseDropdown}
        />,
      );

      await user.click(screen.getByText('Remove from Bundle'));

      expect(onCloseDropdown).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when removing operation is in progress', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        removing: {
          wallet1: { isLoading: true, error: null },
        },
      };

      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
          operations={operations}
        />,
      );

      const button = screen.getByText('Remove from Bundle');
      expect(button).toBeDisabled();
    });

    it('should not be disabled when removing is not in progress', () => {
      render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
          isOwner={true}
        />,
      );

      const button = screen.getByText('Remove from Bundle');
      expect(button).not.toBeDisabled();
    });
  });

  describe('edge cases', () => {
    it('should handle wallet with different IDs', () => {
      const wallet = { ...MOCK_WALLET_1, id: 'wallet999' };
      const onToggleDropdown = vi.fn();

      render(
        <WalletActionMenu
          {...defaultProps}
          wallet={wallet}
          onToggleDropdown={onToggleDropdown}
        />,
      );

      const button = screen.getByRole('button', {
        name: /actions for main wallet/i,
      });
      button.click();

      expect(onToggleDropdown).toHaveBeenCalledWith(
        'wallet999',
        expect.any(HTMLElement),
      );
    });

    it('should handle different DeBank URLs for different addresses', () => {
      const wallet = {
        ...MOCK_WALLET_1,
        address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      };

      render(
        <WalletActionMenu
          {...defaultProps}
          wallet={wallet}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      const link = screen.getByText('View on DeBank').closest('a');
      expect(link).toHaveAttribute(
        'href',
        'https://debank.com/profile/0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      );
    });

    it('should handle toggle with different menu positions', () => {
      const { rerender } = render(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 100, left: 200 }}
        />,
      );

      expect(screen.getByText('Copy Address')).toBeInTheDocument();

      rerender(
        <WalletActionMenu
          {...defaultProps}
          isOpen={true}
          menuPosition={{ top: 500, left: 600 }}
        />,
      );

      expect(screen.getByText('Copy Address')).toBeInTheDocument();
    });
  });

  describe('memo optimization', () => {
    it('should have displayName set', () => {
      expect(WalletActionMenu.displayName).toBe('WalletActionMenu');
    });
  });
});
