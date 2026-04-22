import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddWalletForm } from '@/components/WalletManager/components/AddWalletForm';
import type { WalletOperations } from '@/types';

import {
  DEFAULT_NEW_WALLET,
  DEFAULT_WALLET_OPERATIONS,
} from '../../../../fixtures/componentMocks';

describe('AddWalletForm', () => {
  const defaultProps = {
    isAdding: false,
    newWallet: DEFAULT_NEW_WALLET,
    operations: DEFAULT_WALLET_OPERATIONS,
    validationError: null,
    onWalletChange: vi.fn(),
    onAddWallet: vi.fn(),
    onCancel: vi.fn(),
    onStartAdding: vi.fn(),
  };

  describe('not adding state', () => {
    it('should render Add Another Wallet button when not adding', () => {
      render(<AddWalletForm {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /add another wallet/i }),
      ).toBeInTheDocument();
    });

    it('should call onStartAdding when button is clicked', async () => {
      const user = userEvent.setup();
      const onStartAdding = vi.fn();

      render(<AddWalletForm {...defaultProps} onStartAdding={onStartAdding} />);

      await user.click(
        screen.getByRole('button', { name: /add another wallet/i }),
      );

      expect(onStartAdding).toHaveBeenCalledTimes(1);
    });

    it('should not render form inputs when not adding', () => {
      render(<AddWalletForm {...defaultProps} />);

      expect(
        screen.queryByPlaceholderText(/wallet label/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText(/wallet address/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('adding state - form rendering', () => {
    it('should render form inputs when adding', () => {
      render(<AddWalletForm {...defaultProps} isAdding={true} />);

      expect(screen.getByPlaceholderText(/wallet label/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/wallet address/i),
      ).toBeInTheDocument();
    });

    it('should render Add to Bundle and Cancel buttons', () => {
      render(<AddWalletForm {...defaultProps} isAdding={true} />);

      expect(
        screen.getByRole('button', { name: /add to bundle/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument();
    });

    it('should display label input with correct value', () => {
      const newWallet = { label: 'Trading Wallet', address: '' };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          newWallet={newWallet}
        />,
      );

      const labelInput = screen.getByPlaceholderText(
        /wallet label/i,
      ) as HTMLInputElement;
      expect(labelInput.value).toBe('Trading Wallet');
    });

    it('should display address input with correct value', () => {
      const newWallet = {
        label: '',
        address: '0x1234567890123456789012345678901234567890',
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          newWallet={newWallet}
        />,
      );

      const addressInput = screen.getByPlaceholderText(
        /wallet address/i,
      ) as HTMLInputElement;
      expect(addressInput.value).toBe(
        '0x1234567890123456789012345678901234567890',
      );
    });
  });

  describe('form input changes', () => {
    it('should call onWalletChange when label input changes', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onWalletChange={onWalletChange}
        />,
      );

      const labelInput = screen.getByPlaceholderText(/wallet label/i);
      await user.type(labelInput, 'Test');

      expect(onWalletChange).toHaveBeenCalledWith({ label: 'T' });
      expect(onWalletChange).toHaveBeenCalledWith({ label: 'e' });
      expect(onWalletChange).toHaveBeenCalledWith({ label: 's' });
      expect(onWalletChange).toHaveBeenCalledWith({ label: 't' });
    });

    it('should call onWalletChange when address input changes', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onWalletChange={onWalletChange}
        />,
      );

      const addressInput = screen.getByPlaceholderText(/wallet address/i);
      await user.type(addressInput, '0x');

      expect(onWalletChange).toHaveBeenCalledWith({ address: '0' });
      expect(onWalletChange).toHaveBeenCalledWith({ address: 'x' });
    });

    it('should handle clearing label input', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();
      const newWallet = { label: 'Test', address: '' };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          newWallet={newWallet}
          onWalletChange={onWalletChange}
        />,
      );

      const labelInput = screen.getByPlaceholderText(/wallet label/i);
      await user.clear(labelInput);

      expect(onWalletChange).toHaveBeenCalled();
    });

    it('should handle clearing address input', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();
      const newWallet = { label: '', address: '0x123' };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          newWallet={newWallet}
          onWalletChange={onWalletChange}
        />,
      );

      const addressInput = screen.getByPlaceholderText(/wallet address/i);
      await user.clear(addressInput);

      expect(onWalletChange).toHaveBeenCalled();
    });
  });

  describe('validation error display', () => {
    it('should display validation error when present', () => {
      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          validationError="Wallet address is required"
        />,
      );

      expect(
        screen.getByText(/wallet address is required/i),
      ).toBeInTheDocument();
    });

    it('should not display validation error when null', () => {
      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          validationError={null}
        />,
      );

      expect(
        screen.queryByText(/wallet address is required/i),
      ).not.toBeInTheDocument();
    });

    it('should display multiple validation errors', () => {
      const { rerender } = render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          validationError="Wallet label is required"
        />,
      );

      expect(screen.getByText(/wallet label is required/i)).toBeInTheDocument();

      rerender(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          validationError="Invalid wallet address format"
        />,
      );

      expect(
        screen.getByText(/invalid wallet address format/i),
      ).toBeInTheDocument();
    });
  });

  describe('operation error display', () => {
    it('should display add operation error when present', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        adding: { isLoading: false, error: 'Wallet already associated' },
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          operations={operations}
        />,
      );

      expect(
        screen.getByText(/wallet already associated/i),
      ).toBeInTheDocument();
    });

    it('should not display operation error when null', () => {
      render(<AddWalletForm {...defaultProps} isAdding={true} />);

      expect(
        screen.queryByText(/wallet already associated/i),
      ).not.toBeInTheDocument();
    });

    it('should display both validation and operation errors', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        adding: { isLoading: false, error: 'Network error' },
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          validationError="Wallet address is required"
          operations={operations}
        />,
      );

      expect(
        screen.getByText(/wallet address is required/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when adding is in progress', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        adding: { isLoading: true, error: null },
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          operations={operations}
        />,
      );

      expect(screen.getByText(/adding.../i)).toBeInTheDocument();
    });

    it('should disable Add to Bundle button when loading', () => {
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        adding: { isLoading: true, error: null },
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          operations={operations}
        />,
      );

      const addButton = screen.getByRole('button', { name: /adding.../i });
      expect(addButton).toBeDisabled();
    });

    it('should show Add to Bundle text when not loading', () => {
      render(<AddWalletForm {...defaultProps} isAdding={true} />);

      expect(screen.getByText(/add to bundle/i)).toBeInTheDocument();
      expect(screen.queryByText(/adding.../i)).not.toBeInTheDocument();
    });
  });

  describe('button actions', () => {
    it('should call onAddWallet when Add to Bundle is clicked', async () => {
      const user = userEvent.setup();
      const onAddWallet = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onAddWallet={onAddWallet}
        />,
      );

      await user.click(screen.getByRole('button', { name: /add to bundle/i }));

      expect(onAddWallet).toHaveBeenCalledTimes(1);
    });

    it('should call onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(
        <AddWalletForm {...defaultProps} isAdding={true} onCancel={onCancel} />,
      );

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should not call onAddWallet when button is disabled', async () => {
      const user = userEvent.setup();
      const onAddWallet = vi.fn();
      const operations: WalletOperations = {
        ...DEFAULT_WALLET_OPERATIONS,
        adding: { isLoading: true, error: null },
      };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          operations={operations}
          onAddWallet={onAddWallet}
        />,
      );

      const addButton = screen.getByRole('button', { name: /adding.../i });
      await user.click(addButton);

      // Button is disabled, so click should not trigger handler
      expect(onAddWallet).not.toHaveBeenCalled();
    });

    it('should allow multiple clicks on Add to Bundle when not loading', async () => {
      const user = userEvent.setup();
      const onAddWallet = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onAddWallet={onAddWallet}
        />,
      );

      const addButton = screen.getByRole('button', { name: /add to bundle/i });
      await user.click(addButton);
      await user.click(addButton);

      expect(onAddWallet).toHaveBeenCalledTimes(2);
    });
  });

  describe('form interaction flow', () => {
    it('should handle complete add wallet flow', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();
      const onAddWallet = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onWalletChange={onWalletChange}
          onAddWallet={onAddWallet}
        />,
      );

      // Fill in label
      const labelInput = screen.getByPlaceholderText(/wallet label/i);
      await user.type(labelInput, 'Test Wallet');

      // Fill in address
      const addressInput = screen.getByPlaceholderText(/wallet address/i);
      await user.type(addressInput, '0x1234');

      // Click add button
      await user.click(screen.getByRole('button', { name: /add to bundle/i }));

      expect(onWalletChange).toHaveBeenCalled();
      expect(onAddWallet).toHaveBeenCalledTimes(1);
    });

    it('should handle cancel flow', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();
      const onCancel = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onWalletChange={onWalletChange}
          onCancel={onCancel}
        />,
      );

      // Start typing
      const labelInput = screen.getByPlaceholderText(/wallet label/i);
      await user.type(labelInput, 'Test');

      // Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onWalletChange).toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty wallet data', () => {
      render(<AddWalletForm {...defaultProps} isAdding={true} />);

      const labelInput = screen.getByPlaceholderText(
        /wallet label/i,
      ) as HTMLInputElement;
      const addressInput = screen.getByPlaceholderText(
        /wallet address/i,
      ) as HTMLInputElement;

      expect(labelInput.value).toBe('');
      expect(addressInput.value).toBe('');
    });

    it('should handle long wallet labels', () => {
      const longLabel = 'A'.repeat(100);
      const newWallet = { label: longLabel, address: '' };

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          newWallet={newWallet}
        />,
      );

      const labelInput = screen.getByPlaceholderText(
        /wallet label/i,
      ) as HTMLInputElement;
      expect(labelInput.value).toBe(longLabel);
    });

    it('should handle special characters in inputs', async () => {
      const user = userEvent.setup();
      const onWalletChange = vi.fn();

      render(
        <AddWalletForm
          {...defaultProps}
          isAdding={true}
          onWalletChange={onWalletChange}
        />,
      );

      const labelInput = screen.getByPlaceholderText(/wallet label/i);
      await user.type(labelInput, 'Test-Wallet_123');

      expect(onWalletChange).toHaveBeenCalled();
    });

    it('should render without Add Another Wallet button text when not adding', () => {
      render(<AddWalletForm {...defaultProps} isAdding={false} />);

      const button = screen.getByRole('button', {
        name: /add another wallet/i,
      });
      expect(button).toBeInTheDocument();
    });
  });
});
