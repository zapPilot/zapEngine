// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useHyperliquidAgentSession } from '@core/hooks/useHyperliquidAgentSession';
import type { HyperliquidAgentKeyStore } from '@core/types/domain/wallet';
import type { HyperliquidSigning } from '@zapengine/types/api';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MASTER = '0x1111111111111111111111111111111111111111' as Address;
const OTHER_MASTER = '0x2222222222222222222222222222222222222222' as Address;
const AGENT = '0x3333333333333333333333333333333333333333' as Address;

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

const record = {
  privateKey: `0x${'ab'.repeat(32)}` as const,
  address: AGENT,
  name: 'ZapPilot' as const,
  createdAt: 1_000,
};

const signer = { address: AGENT };

const keyStore: HyperliquidAgentKeyStore = {
  load: vi.fn(async () => null),
  save: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
};

function render(signingValue: HyperliquidSigning | null = signing) {
  return renderHook(
    ({ s }: { s: HyperliquidSigning | null }) =>
      useHyperliquidAgentSession({ keyStore, signing: s }),
    { initialProps: { s: signingValue } },
  );
}

describe('useHyperliquidAgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: MASTER },
      getWalletClient: mocks.getWalletClient,
    });
    mocks.getWalletClient.mockResolvedValue({ account: { address: MASTER } });
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(null);
    mocks.approveNewHyperliquidAgent.mockResolvedValue(record);
    mocks.hyperliquidAgentSigner.mockReturnValue(signer);
  });

  it('reports an approved device-local agent as ready', async () => {
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    const { result } = render();

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.isReady).toBe(true);
    expect(result.current.agentAddress).toBe(AGENT);
    expect(result.current.masterAddress).toBe(MASTER);
    expect(mocks.loadApprovedHyperliquidAgent).toHaveBeenCalledWith(
      expect.objectContaining({ keyStore, masterAddress: MASTER, signing }),
    );
  });

  it('reports a missing or revoked agent as unapproved, not ready', async () => {
    const { result } = render();

    await waitFor(() => {
      expect(result.current.status).toBe('unapproved');
    });
    expect(result.current.isReady).toBe(false);
    expect(result.current.agentAddress).toBeNull();
    await expect(result.current.getSigner(MASTER)).rejects.toThrow(
      'Enable Hyperliquid signing',
    );
  });

  it('stays idle until a plan supplies the signing target', async () => {
    const { result, rerender } = render(null);

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(mocks.loadApprovedHyperliquidAgent).not.toHaveBeenCalled();

    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    rerender({ s: signing });
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
  });

  it('does not re-check on a render that changes nothing', async () => {
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    const { result, rerender } = render();
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    rerender({ s: signing });
    rerender({ s: signing });

    // A re-check renews the abort controller, so a spurious one would cancel
    // an approval the user is midway through confirming.
    expect(mocks.loadApprovedHyperliquidAgent).toHaveBeenCalledTimes(1);
  });

  it('surfaces refresh failures without exposing a stale signer', async () => {
    mocks.loadApprovedHyperliquidAgent.mockRejectedValueOnce(
      new Error('agent lookup failed'),
    );
    const { result } = render();

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toContain('agent lookup failed');
    expect(result.current.isReady).toBe(false);
  });

  it('drops a stale successful refresh after signing is removed', async () => {
    let resolveLoad: ((value: typeof record) => void) | undefined;
    mocks.loadApprovedHyperliquidAgent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    );
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('checking'));

    rerender({ s: null });
    resolveLoad?.(record);
    await waitFor(() => expect(result.current.status).toBe('idle'));

    expect(result.current.agentAddress).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('drops a stale refresh failure after signing is removed', async () => {
    let rejectLoad: ((error: Error) => void) | undefined;
    mocks.loadApprovedHyperliquidAgent.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('checking'));

    rerender({ s: null });
    rejectLoad?.(new Error('stale lookup failure'));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    expect(result.current.error).toBeNull();
  });

  it('rejects a second approval while the first wallet prompt is pending', async () => {
    let resolveWallet:
      | ((value: { account: { address: Address } }) => void)
      | undefined;
    mocks.getWalletClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveWallet = resolve;
      }),
    );
    const { result } = render();
    await waitFor(() => expect(result.current.status).toBe('unapproved'));

    let firstApproval: Promise<void> | undefined;
    act(() => {
      firstApproval = result.current.approve();
    });
    await expect(result.current.approve()).rejects.toThrow(
      'approval is already in progress',
    );
    resolveWallet?.({ account: { address: MASTER } });
    await act(async () => {
      await firstApproval;
    });

    expect(mocks.approveNewHyperliquidAgent).toHaveBeenCalledOnce();
  });

  it('stops approval after the wallet prompt when the session is reset', async () => {
    let resolveWallet:
      | ((value: { account: { address: Address } }) => void)
      | undefined;
    mocks.getWalletClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveWallet = resolve;
      }),
    );
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('unapproved'));

    let approval: Promise<void> | undefined;
    act(() => {
      approval = result.current.approve();
    });
    rerender({ s: null });
    resolveWallet?.({ account: { address: MASTER } });
    await act(async () => {
      await approval;
    });

    expect(mocks.approveNewHyperliquidAgent).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('drops an approved record that resolves after the session is reset', async () => {
    let resolveApproval: ((value: typeof record) => void) | undefined;
    mocks.approveNewHyperliquidAgent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveApproval = resolve;
      }),
    );
    const { result, rerender } = render();
    await waitFor(() => expect(result.current.status).toBe('unapproved'));

    let approval: Promise<void> | undefined;
    act(() => {
      approval = result.current.approve();
    });
    await waitFor(() =>
      expect(mocks.approveNewHyperliquidAgent).toHaveBeenCalledOnce(),
    );
    rerender({ s: null });
    resolveApproval?.(record);
    await act(async () => {
      await approval;
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.isReady).toBe(false);
  });

  it('approves a fresh agent and exposes its signer', async () => {
    const { result } = render();
    await waitFor(() => {
      expect(result.current.status).toBe('unapproved');
    });

    await act(async () => {
      await result.current.approve();
    });

    expect(mocks.approveNewHyperliquidAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        keyStore,
        masterAddress: MASTER,
        signing,
        walletClient: { account: { address: MASTER } },
      }),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.isReady).toBe(true);
    await expect(result.current.getSigner(MASTER)).resolves.toBe(signer);
    expect(mocks.hyperliquidAgentSigner).toHaveBeenCalledWith(record);
  });

  it('refuses to approve for a wallet that changed during the prompt', async () => {
    mocks.getWalletClient.mockResolvedValue({
      account: { address: OTHER_MASTER },
    });
    const { result } = render();
    await waitFor(() => {
      expect(result.current.status).toBe('unapproved');
    });

    await act(async () => {
      await expect(result.current.approve()).rejects.toThrow(
        'connected wallet changed',
      );
    });

    expect(mocks.approveNewHyperliquidAgent).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.isReady).toBe(false);
  });

  it('surfaces an approval failure without leaving a usable signer', async () => {
    mocks.approveNewHyperliquidAgent.mockRejectedValue(
      new Error('Hyperliquid agent approval failed: rejected'),
    );
    const { result } = render();
    await waitFor(() => {
      expect(result.current.status).toBe('unapproved');
    });

    await act(async () => {
      await expect(result.current.approve()).rejects.toThrow('rejected');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('rejected');
    await expect(result.current.getSigner(MASTER)).rejects.toThrow(
      'Enable Hyperliquid signing',
    );
  });

  it('never hands the signer to a master wallet it was not approved for', async () => {
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    const { result } = render();
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    // The deposit measured one account's balance; signing for another would
    // move a different account's funds on the strength of that measurement.
    await expect(result.current.getSigner(OTHER_MASTER)).rejects.toThrow(
      'Enable Hyperliquid signing',
    );
  });

  it('invalidates the session when the connected master wallet changes', async () => {
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    const { result, rerender } = render();
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(null);
    mocks.useWalletProvider.mockReturnValue({
      account: { address: OTHER_MASTER },
      getWalletClient: mocks.getWalletClient,
    });
    rerender({ s: signing });

    await waitFor(() => {
      expect(result.current.masterAddress).toBe(OTHER_MASTER);
    });
    expect(result.current.isReady).toBe(false);
    await expect(result.current.getSigner(MASTER)).rejects.toThrow(
      'Enable Hyperliquid signing',
    );
  });

  it('drops the session entirely once the wallet disconnects', async () => {
    mocks.loadApprovedHyperliquidAgent.mockResolvedValue(record);
    const { result, rerender } = render();
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    mocks.useWalletProvider.mockReturnValue({
      account: undefined,
      getWalletClient: mocks.getWalletClient,
    });
    rerender({ s: signing });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    });
    expect(result.current.agentAddress).toBeNull();
    expect(result.current.isReady).toBe(false);
    await expect(result.current.approve()).rejects.toThrow(
      'Connect the wallet',
    );
  });
});
