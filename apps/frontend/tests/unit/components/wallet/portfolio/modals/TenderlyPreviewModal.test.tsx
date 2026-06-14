import { fireEvent, render, screen } from '@testing-library/react';
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
    shareUrls: ['https://www.tdly.co/shared/simulation/sim-1'],
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
  isSigningAndSending: false,
  isRetryingSimulation: false,
};

describe('TenderlyPreviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders network, block, simulated call gas, and wallet-relative assets', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    expect(screen.getByText('Simulation passed')).toBeInTheDocument();
    expect(screen.getByText(/Base/)).toBeInTheDocument();
    expect(screen.getByText(/123,456/)).toBeInTheDocument();
    expect(screen.getByText('Simulated call gas')).toBeInTheDocument();
    expect(screen.getByText(/-1.2345 TKN/)).toBeInTheDocument();
  });

  it('formats token amounts from Tenderly decimals', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({
          assetChanges: [
            {
              ...preview().assetChanges[0]!,
              token: {
                ...preview().assetChanges[0]!.token,
                symbol: 'WBTC',
                decimals: 8,
              },
              rawAmount: '123456789',
              amount: '1.23456789',
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/-1.23456789 WBTC/)).toBeInTheDocument();
  });

  it('shows approvals and expandable execution steps', () => {
    render(
      <TenderlyPreviewModal
        {...defaultProps}
        previewData={preview({
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

    expect(screen.getByText('Approval exposure')).toBeInTheDocument();
    expect(screen.getByText(/1 TKN/)).toBeInTheDocument();
    expect(screen.getByText(/Call 1: deposit/)).toBeInTheDocument();
  });

  it('requires explicit warning acknowledgement and passes the risk hash', () => {
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
    expect(signButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(signButton).toBeEnabled();
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

    expect(screen.getByRole('button', { name: 'Sign & Send' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Sign & Send' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Retry simulation' }),
    ).toBeEnabled();
  });

  it('renders public Tenderly links with safe external-link attributes and privacy notice', () => {
    render(<TenderlyPreviewModal {...defaultProps} />);

    const link = screen.getByRole('link', { name: /Tenderly simulation 1/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/anyone with the link/i)).toBeInTheDocument();
  });

  it('renders nothing without preview data', () => {
    render(<TenderlyPreviewModal {...defaultProps} previewData={null} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });
});
