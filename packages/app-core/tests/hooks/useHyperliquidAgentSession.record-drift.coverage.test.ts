// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { useHyperliquidAgentSession } from '@core/hooks/useHyperliquidAgentSession';
import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import type { HyperliquidSigning } from '@zapengine/types/api';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MASTER = '0x1111111111111111111111111111111111111111' as Address;
const AGENT = '0x3333333333333333333333333333333333333333' as Address;
const DRIFTED_AGENT = '0x4444444444444444444444444444444444444444' as Address;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  loadApprovedHyperliquidAgent: vi.fn(),
  hyperliquidAgentSigner: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/hyperliquidAgentService', () => ({
  loadApprovedHyperliquidAgent: mocks.loadApprovedHyperliquidAgent,
  approveNewHyperliquidAgent: vi.fn(),
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

describe('useHyperliquidAgentSession signer guard coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: MASTER },
      getWalletClient: vi.fn(),
    });
  });

  it('rejects a signer when the retained local record no longer matches ready state', async () => {
    const record = {
      privateKey: `0x${'ab'.repeat(32)}` as const,
      address: AGENT,
      name: 'ZapPilot' as const,
      createdAt: 1_000,
    };
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);

    const { result } = renderHook(() =>
      useHyperliquidAgentSession({ keyStore, signing }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    record.address = DRIFTED_AGENT;

    await expect(result.current.getSigner(MASTER)).rejects.toThrow(
      'Enable Hyperliquid signing for this wallet first',
    );
    expect(mocks.hyperliquidAgentSigner).not.toHaveBeenCalled();
  });
});
