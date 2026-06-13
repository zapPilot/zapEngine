import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenderlyPreviewModal } from '@/components/wallet/portfolio/modals/TenderlyPreviewModal';

vi.mock('@/components/ui/modal', () => ({
  Modal: ({
    children,
    isOpen,
    onClose,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="modal" data-open={isOpen}>
        <button data-testid="modal-close-trigger" onClick={onClose} />
        {children}
      </div>
    ) : null,
  ModalContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="modal-content" className={className}>
      {children}
    </div>
  ),
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  previewData: {
    previewId: 'preview-1',
    batchHash: '0xabc',
    decodedCalls: [
      {
        type: 'approve' as const,
        token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        spender: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        amount: '10000000',
      },
      {
        type: 'supply' as const,
        token: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        receiver: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
        amount: '10000000',
      },
    ],
    assetChanges: [
      {
        type: 'transfer' as const,
        token: 'USDC',
        tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        from: '0x1234567890123456789012345678901234567890',
        to: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        amount: '10000000',
      },
      {
        type: 'mint' as const,
        token: 'aUSDC',
        tokenAddress: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        from: '0x0000000000000000000000000000000000000000',
        to: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
        amount: '10000000',
      },
    ],
    gasEstimate: '350000',
    expiresAt: Date.now() + 300_000,
  },
  onConfirm: vi.fn().mockResolvedValue(undefined),
  isSigningAndSending: false,
};

describe('TenderlyPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when previewData is null', () => {
    render(<TenderlyPreviewModal {...defaultProps} previewData={null} />);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders the modal when previewData is provided', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByText('Tenderly Simulation Preview')).toBeInTheDocument();
  });

  it('displays gas estimate', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText(/350,000 units/)).toBeInTheDocument();
  });

  it('displays Pre-flight OK status', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText('Pre-flight OK')).toBeInTheDocument();
  });

  it('displays Simulation Succeeded alert', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText('Simulation Succeeded')).toBeInTheDocument();
  });

  it('renders decoded calls', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText('Approve Spender')).toBeInTheDocument();
    expect(screen.getByText('Supply Pool')).toBeInTheDocument();
  });

  it('renders asset changes', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText(/Deduct.*USDC/)).toBeInTheDocument();
    expect(screen.getByText(/Receive.*aUSDC/)).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<TenderlyPreviewModal {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm when Sign & Send button is clicked', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TenderlyPreviewModal {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Sign & Send'));

    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows loading state when signing and sending', () => {
    render(
      <TenderlyPreviewModal {...defaultProps} isSigningAndSending={true} />,
    );

    expect(screen.getByText('Sign & Send...')).toBeInTheDocument();
  });

  it('disables buttons when signing and sending', () => {
    render(
      <TenderlyPreviewModal {...defaultProps} isSigningAndSending={true} />,
    );

    const cancelButton = screen.getByText('Cancel');
    const signButton = screen.getByText('Sign & Send...').closest('button');

    expect(cancelButton).toBeDisabled();
    expect(signButton).toBeDisabled();
  });

  it('shows expired message when preview has expired', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={{
          ...defaultProps.previewData,
          expiresAt: Date.now() - 1000,
        }}
      />,
    );

    expect(
      screen.getByText('This preview has expired. Please close and try again.'),
    ).toBeInTheDocument();
  });

  it('disables Sign & Send when expired', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={{
          ...defaultProps.previewData,
          expiresAt: Date.now() - 1000,
        }}
      />,
    );

    const signButton = screen.getByText('Sign & Send').closest('button');
    expect(signButton).toBeDisabled();
  });

  it('handles decoded calls without amount', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={{
          ...defaultProps.previewData,
          decodedCalls: [
            {
              type: 'unknown',
              token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Supply Pool')).toBeInTheDocument();
  });

  it('handles decoded calls without spender or receiver', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={{
          ...defaultProps.previewData,
          decodedCalls: [
            {
              type: 'supply',
              token: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
              amount: '10000000',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Supply Pool')).toBeInTheDocument();
  });

  it('handles empty decoded calls and asset changes', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={{
          ...defaultProps.previewData,
          decodedCalls: [],
          assetChanges: [],
        }}
      />,
    );

    expect(screen.getByText('Execution Sequence')).toBeInTheDocument();
    expect(screen.getByText('Expected Balance Changes')).toBeInTheDocument();
  });

  it('prevents close while signing and sending', () => {
    const onClose = vi.fn();
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        onClose={onClose}
        isSigningAndSending={true}
      />,
    );

    // The close button in the header should still be rendered but the Modal's
    // onClose is replaced with a noop by the component when isSigningAndSending
    // The cancel button is disabled so clicking it should not trigger onClose
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Button is disabled, so onClose should not be called
    expect(onClose).not.toHaveBeenCalled();
  });
});
