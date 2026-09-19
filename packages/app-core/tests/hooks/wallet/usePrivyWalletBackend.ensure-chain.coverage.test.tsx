// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { WALLET_NOT_CONNECTED_ERROR } from '@core/lib/wallet/privyAtomicBatch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn(),
  user: undefined as
    | { linkedAccounts: Array<Record<string, unknown>> }
    | undefined,
  wallets: [] as Array<{
    address: string;
    chainId?: string;
    walletClientType: string;
    getEthereumProvider: ReturnType<typeof vi.fn>;
    switchChain: ReturnType<typeof vi.fn>;
  }>,
  generateAuthorizationSignature: vi.fn(),
  signPrivyTypedData: vi.fn(),
  atomicArgs: undefined as Record<string, unknown> | undefined,
  executeAtomicBatch: vi.fn(),
  executeReviewedBatch: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    ready: mocks.ready,
    authenticated: mocks.authenticated,
    login: mocks.login,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
    user: mocks.user,
  }),
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: mocks.generateAuthorizationSignature,
  }),
  useSignTypedData: () => ({ signTypedData: mocks.signPrivyTypedData }),
  useWallets: () => ({ wallets: mocks.wallets }),
}));

vi.mock('@core/hooks/wallet/useAtomicBatchExecution', () => ({
  useAtomicBatchExecution: (args: Record<string, unknown>) => {
    mocks.atomicArgs = args;
    return {
      executeAtomicBatch: mocks.executeAtomicBatch,
      executeReviewedBatch: mocks.executeReviewedBatch,
      simulationPreview: null,
      confirmBatchExecution: vi.fn(),
      retryBatchSimulation: vi.fn(),
      updateApprovalAmount: vi.fn(),
      cancelBatchExecution: vi.fn(),
      isSigningAndSending: false,
      batchExecutionPhase: 'idle',
      isRetryingSimulation: false,
      retryError: null,
    };
  },
}));

vi.mock('@core/utils', () => ({
  walletLogger: { info: vi.fn(), error: vi.fn() },
}));

import { usePrivyWalletBackend } from '@core/hooks/wallet/usePrivyWalletBackend';

describe('usePrivyWalletBackend ensureChain coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.user = undefined;
    mocks.wallets = [];
    mocks.atomicArgs = undefined;
  });

  it('fails closed when ensuring batch chain without an embedded wallet', async () => {
    renderHook(() => usePrivyWalletBackend());

    const ensureChain = mocks.atomicArgs?.ensureChain as (
      chainId: number,
    ) => Promise<void>;
    expect(typeof ensureChain).toBe('function');
    await expect(ensureChain(42161)).rejects.toThrow(
      WALLET_NOT_CONNECTED_ERROR,
    );
  });
});
