import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetDefaultConfirmModal } from '@/components/wallet/portfolio/views/invest/configManager/SetDefaultConfirmModal';

vi.mock('@/components/ui/modal', () => ({
  Modal: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  ModalHeader: ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div data-testid="modal-header">
      <span>{title}</span>
      <button onClick={onClose} data-testid="header-close">
        X
      </button>
    </div>
  ),
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-footer">{children}</div>
  ),
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  isPending: false,
  currentDefaultName: 'DMA Default',
  targetConfigName: 'ETH Rotation',
};

describe('SetDefaultConfirmModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<SetDefaultConfirmModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(<SetDefaultConfirmModal {...defaultProps} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('displays the modal title', () => {
    render(<SetDefaultConfirmModal {...defaultProps} />);
    expect(
      screen.getByText('Change Default Configuration'),
    ).toBeInTheDocument();
  });

  it('displays the current and target config names', () => {
    render(<SetDefaultConfirmModal {...defaultProps} />);
    expect(screen.getByText('DMA Default')).toBeInTheDocument();
    expect(screen.getByText('ETH Rotation')).toBeInTheDocument();
  });

  it('shows Confirm button when isPending is false', () => {
    render(<SetDefaultConfirmModal {...defaultProps} isPending={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('shows Setting... button text when isPending is true', () => {
    render(<SetDefaultConfirmModal {...defaultProps} isPending={true} />);
    expect(screen.getByText('Setting...')).toBeInTheDocument();
  });

  it('calls onConfirm when Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<SetDefaultConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<SetDefaultConfirmModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('disables both buttons when isPending is true', () => {
    render(<SetDefaultConfirmModal {...defaultProps} isPending={true} />);
    const cancelButton = screen.getByText('Cancel');
    const confirmButton = screen.getByText('Setting...');
    expect(cancelButton).toBeDisabled();
    expect(confirmButton).toBeDisabled();
  });

  it('does not disable buttons when isPending is false', () => {
    render(<SetDefaultConfirmModal {...defaultProps} isPending={false} />);
    const cancelButton = screen.getByText('Cancel');
    const confirmButton = screen.getByText('Confirm');
    expect(cancelButton).not.toBeDisabled();
    expect(confirmButton).not.toBeDisabled();
  });
});
