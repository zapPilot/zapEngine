// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectAsync: vi.fn(),
  disconnectAsync: vi.fn(),
  switchChainAsync: vi.fn(),
  signMessageAsync: vi.fn(),
  signTypedDataAsync: vi.fn(),
  connectors: [] as { id: string; name: string; type: string }[],
}));

vi.mock('wagmi', () => ({
  useConnection: () => ({
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connector: undefined,
    chain: undefined,
  }),
  useConnectors: () => mocks.connectors,
  useConnect: () => ({ mutateAsync: mocks.connectAsync, isPending: false }),
  useDisconnect: () => ({
    mutateAsync: mocks.disconnectAsync,
    isPending: false,
  }),
  useSwitchChain: () => ({ mutateAsync: mocks.switchChainAsync }),
  useSignMessage: () => ({ mutateAsync: mocks.signMessageAsync }),
  useSignTypedData: () => ({ mutateAsync: mocks.signTypedDataAsync }),
  useBalance: () => ({ data: undefined }),
}));

vi.mock('wagmi/actions', () => ({
  getWalletClient: vi.fn(),
}));

vi.mock('@core/config/wagmi', () => ({
  getWagmiConfig: () => ({}),
}));

vi.mock('@zapengine/intent-engine', () => ({
  waitForEIP7702Confirmation: vi.fn(),
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  assertEIP7702DelegationCompatibility: vi.fn(),
  isEIP7702WalletRecoveryError: () => false,
  submitPreparedTransactionsWithEIP7702: vi.fn(),
}));

vi.mock('@core/utils', () => ({
  walletLogger: { info: vi.fn(), error: vi.fn() },
}));

import { useWagmiWalletBackend } from '@core/hooks/wallet/useWagmiWalletBackend';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectors = [];
  mocks.connectAsync.mockResolvedValue(undefined);
  mocks.disconnectAsync.mockResolvedValue(undefined);
  mocks.switchChainAsync.mockResolvedValue(undefined);
});

describe('useWagmiWalletBackend sparse connector coverage', () => {
  it('does not attempt a connection when a one-slot connector array has no connector', async () => {
    mocks.connectors = new Array(1) as typeof mocks.connectors;
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await result.current.backend.connect();
    });

    expect(mocks.connectAsync).not.toHaveBeenCalled();
    expect(result.current.backend.error).toBeNull();
  });
});
