import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PrivyPrepareSendCallsResponse } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenderlyPreviewModal } from '@/components/wallet/portfolio/modals/TenderlyPreviewModal';

vi.mock('@/components/ui/modal', () => ({
  Modal: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const TARGET = '0x3333333333333333333333333333333333333333';
const RISK_HASH = `0x${'2'.repeat(64)}`;

function preview(
  overrides: Partial<PrivyPrepareSendCallsResponse> = {},
): PrivyPrepareSendCallsResponse {
  return {
    status: 'passed',
    chainId: 8453,
    walletAddress: WALLET,
    calls: [
      {
        index: 0,
        to: TARGET,
        data: '0x1234',
        value: '0',
        method: 'deposit',
        status: 'succeeded',
        gasUsed: '21000',
        error: null,
        contractVerified: true,
      },
    ],
    assetChanges: [
      {
        callIndex: 0,
        direction: 'out',
        type: 'Transfer',
        from: WALLET,
        to: TARGET,
        token: {
          address: TOKEN,
          symbol: 'TKN',
          name: 'Token',
          decimals: 18,
          logoUrl: null,
        },
        rawAmount: '1234500000000000000',
        amount: '1.2345',
      },
    ],
    approvals: [],
    contracts: [
      { address: TARGET, name: 'Vault', verified: true, callIndexes: [0] },
    ],
    warnings: [],
    blockNumber: 123456,
    callGas: '21000',
    simulationIds: ['sim-1'],
    shareUrls: [],
    simulationFingerprint: `0x${'1'.repeat(64)}`,
    riskHash: RISK_HASH,
    previewId: 'preview-1',
    batchHash: `0x${'3'.repeat(64)}`,
    typedDataPayload: {},
    expiresAt: Date.now() + 300_000,
    authorizationPayload: 'authorization-payload',
    requestExpiry: Date.now() + 300_000,
    ...overrides,
  } as PrivyPrepareSendCallsResponse;
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  previewData: preview(),
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onRetry: vi.fn().mockResolvedValue(undefined),
  onUpdateApproval: vi.fn().mockResolvedValue(undefined),
  isSigningAndSending: false,
  isRetryingSimulation: false,
};

describe('TenderlyPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wallet and asset flow with simulation evidence in advanced details', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({
          shareUrls: ['https://www.tdly.co/shared/simulation/sim-1'],
        })}
      />,
    );

    expect(screen.queryByText('Simulation passed')).not.toBeInTheDocument();
    expect(screen.getByText('0x1111...1111')).toBeInTheDocument();
    expect(screen.getByText('on Base')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Assets out')).toBeInTheDocument();
    expect(screen.getByText('Assets in')).toBeInTheDocument();
    expect(screen.getByText(/-1.2345 TKN/)).toBeInTheDocument();
    expect(screen.queryByText('Simulation evidence')).not.toBeInTheDocument();

    const advancedDetails = screen
      .getByText('Advanced details')
      .closest('details');
    expect(advancedDetails).toHaveTextContent('Network');
    expect(advancedDetails).toHaveTextContent('123,456');
    expect(advancedDetails).toHaveTextContent('Call gas');
    expect(advancedDetails).toHaveTextContent('Expires');
    const tenderlyLink = screen.getByRole('link', {
      name: 'View simulation 1 on Tenderly',
    });
    expect(advancedDetails).toContainElement(tenderlyLink);
    expect(tenderlyLink).toHaveAttribute('target', '_blank');
    expect(tenderlyLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('compacts long token amounts while preserving the exact value in a tooltip', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({
          assetChanges: [
            {
              ...preview().assetChanges[0]!,
              token: {
                ...preview().assetChanges[0]!.token,
                symbol: 'LONGTOKENLONGTOKEN',
                name: 'Spark USDC Vault With A Very Long Display Name',
                decimals: 18,
              },
              rawAmount: '9360528111924722',
              amount: '0.009360528111924722',
            },
          ],
        })}
      />,
    );

    const amount = screen.getByTitle(
      '-0.009360528111924722 LONGTOKENLONGTOKEN',
    );
    expect(amount).toHaveTextContent('-0.00936052 LONGTOKENLONGTOKEN');
    expect(amount).toHaveClass('truncate');
    expect(
      screen.getByText('Spark USDC Vault With A Very Long Display Name'),
    ).toHaveClass('truncate');
  });

  it('merges approval exposure into the matching execution step', async () => {
    const onUpdateApproval = vi.fn().mockResolvedValue(undefined);
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        onUpdateApproval={onUpdateApproval}
        previewData={preview({
          calls: [
            {
              ...preview().calls[0]!,
              method: 'approve',
            },
          ],
          approvals: [
            {
              callIndex: 0,
              owner: WALLET,
              spender: TARGET,
              token: preview().assetChanges[0]!.token,
              rawAmount: '1000000000000000000',
              amount: '1',
              unlimited: false,
              simulatedSpendRaw: '500000000000000000',
              exceedsSimulatedSpend: true,
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText('Approval exposure')).not.toBeInTheDocument();
    const approveStep = screen
      .getByText('Approve', { selector: 'span' })
      .closest('details');
    expect(approveStep).toHaveTextContent('Approve 1 TKN');
    expect(approveStep).toHaveTextContent('Spender');
    expect(approveStep).toHaveTextContent('0x3333...3333');
    expect(approveStep).toHaveTextContent('Raw data');
    expect(approveStep).toHaveTextContent('0x1234');
    expect(approveStep).toHaveTextContent(
      'Approval exceeds the amount spent in this simulation.',
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fireEvent.change(screen.getByLabelText('Approval amount'), {
      target: { value: '0.75' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply & simulate' }));
    await waitFor(() =>
      expect(onUpdateApproval).toHaveBeenCalledWith(0, '0.75'),
    );
  });

  it('allows warning previews to sign directly and passes the risk hash', () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        onConfirm={onConfirm}
        previewData={preview({
          status: 'warning',
          warnings: [
            {
              code: 'UNVERIFIED_CONTRACT',
              message: 'Target is not verified',
              callIndex: 0,
              address: TARGET,
            },
          ],
        })}
      />,
    );

    const signButton = screen.getByRole('button', { name: 'Sign & Send' });
    expect(signButton).toBeEnabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Target is not verified'),
    ).not.toBeInTheDocument();
    fireEvent.click(signButton);
    expect(onConfirm).toHaveBeenCalledWith(RISK_HASH);
  });

  it.each([
    preview({ status: 'failed', failureReason: 'execution reverted' }),
    preview({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
    }),
  ])('blocks signing and allows retry for $status previews', (previewData) => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={previewData}
        onRetry={onRetry}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Sign & Send' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry simulation' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('blocks expired previews and offers retry', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({ expiresAt: Date.now() - 1 })}
      />,
    );

    expect(screen.getByText(/preview has expired/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign & Send' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry simulation' }),
    ).toBeEnabled();
  });

  it('does not show invalid expiry evidence for an unavailable preview', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({
          status: 'unavailable',
          unavailableReason: 'Tenderly simulation timed out',
        })}
      />,
    );

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText('Expires')).not.toBeInTheDocument();
  });

  it('announces retry errors without replacing the current review', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        retryError="Tenderly simulation timed out"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Retry failed: Tenderly simulation timed out',
    );
  });

  it('renders nothing without preview data', () => {
    render(<TenderlyPreviewModal {...defaultProps} previewData={null} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });
});
