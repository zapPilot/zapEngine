// @vitest-environment jsdom
import { useHyperliquidAgentSession } from '@core/hooks/useHyperliquidAgentSession';
import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HyperliquidSigning } from '@zapengine/types/api';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MASTER = '0x1111111111111111111111111111111111111111' as Address;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getWalletClient: vi.fn(),
  loadApprovedHyperliquidAgent: vi.fn(),
  approveNewHyperliquidAgent: vi.fn(),
  hyperliquidAgentSigner: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/hyperliquidAgentService', () => ({
  loadApprovedHyperliquidAgent: mocks.loadApprovedHyperliquidAgent,
  approveNewHyperliquidAgent: mocks.approveNewHyperliquidAgent,
  hyperliquidAgentSigner: mocks.hyperliquidAgentSigner,
}));

const signing: HyperliquidSigning = {
  scheme: 'hyperliquid-l1-action',
  hyperliquidChain: 'Mainnet',
  apiUrl: 'https://api.hyperliquid.xyz',
};

const keyStore: HyperliquidAgentKeyStore = {
  load: vi.fn(async () => null),
  save: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
};

describe('useHyperliquidAgentSession aborted approval coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: MASTER },
      getWalletClient: mocks.getWalletClient,
    });
    mocks.getWalletClient.mockResolvedValue({ account: { address: MASTER } });
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(null);
  });

  it('ignores an approval rejection after the signing session is reset', async () => {
    let rejectApproval: ((error: Error) => void) | undefined;
    mocks.approveNewHyperliquidAgent.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectApproval = reject;
      }),
    );

    const { result, rerender } = renderHook(
      ({ target }: { target: HyperliquidSigning | null }) =>
        useHyperliquidAgentSession({ keyStore, signing: target }),
      { initialProps: { target: signing as HyperliquidSigning | null } },
    );
    await waitFor(() => expect(result.current.status).toBe('unapproved'));

    let approval: Promise<void> | undefined;
    act(() => {
      approval = result.current.approve();
    });
    await waitFor(() =>
      expect(mocks.approveNewHyperliquidAgent).toHaveBeenCalledOnce(),
    );

    rerender({ target: null });
    rejectApproval?.(new Error('stale approval rejection'));
    await act(async () => {
      await approval;
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.isReady).toBe(false);
  });
});
