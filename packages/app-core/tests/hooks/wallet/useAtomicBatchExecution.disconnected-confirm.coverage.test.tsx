// @vitest-environment jsdom
import {
  type AtomicBatchExecutionDeps,
  useAtomicBatchExecution,
} from '@core/hooks/wallet/useAtomicBatchExecution';
import { act, renderHook } from '@testing-library/react';
import type {
  PreparedTransaction,
  PrivyPrepareSendCallsResponse,
} from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  preparePrivyAtomicBatch: vi.fn(),
  sendPrivyAtomicBatch: vi.fn(),
}));

vi.mock('@core/services/privyWalletService', () => ({
  preparePrivyAtomicBatch: mocks.preparePrivyAtomicBatch,
  sendPrivyAtomicBatch: mocks.sendPrivyAtomicBatch,
}));

vi.mock('@core/utils', () => ({
  walletLogger: { info: vi.fn(), error: vi.fn() },
}));

const WALLET_ADDRESS = '0x2222222222222222222222222222222222222222';

function makeDeps(walletAddress: string | undefined): AtomicBatchExecutionDeps {
  return {
    getAccessToken: vi.fn(async () => 'access-token'),
    signPreviewTypedData: vi.fn(async () => '0xusersig' as `0x${string}`),
    generateAuthorizationSignature: vi.fn(async () => ({
      signature: 'authsig',
    })),
    ensureChain: vi.fn(async () => {}),
    resolveWalletId: vi.fn(() => 'wallet-id'),
    walletAddress,
  };
}

const transaction: PreparedTransaction = {
  to: '0x1111111111111111111111111111111111111111',
  data: '0x',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'swap' },
};

const preview = {
  status: 'passed',
  previewId: 'preview-1',
  typedDataPayload: {
    domain: {},
    types: {},
    primaryType: 'ZapPilotIntent',
    message: {},
  },
  authorizationPayload: 'aGVsbG8=',
  approvals: [],
  simulationFingerprint: `0x${'cd'.repeat(32)}`,
  riskHash: `0x${'ab'.repeat(32)}`,
} as unknown as PrivyPrepareSendCallsResponse;

describe('useAtomicBatchExecution disconnected confirmation coverage', () => {
  it('refuses confirmation if the wallet disconnects after preview', async () => {
    mocks.preparePrivyAtomicBatch.mockResolvedValue(preview);
    const connected = makeDeps(WALLET_ADDRESS);
    const disconnected = makeDeps(undefined);
    const hook = renderHook(
      ({ deps }: { deps: AtomicBatchExecutionDeps }) =>
        useAtomicBatchExecution(deps),
      { initialProps: { deps: connected } },
    );

    let execution: Promise<unknown> | undefined;
    await act(async () => {
      execution = hook.result.current.executeAtomicBatch([transaction], 8453);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(hook.result.current.simulationPreview?.status).toBe('passed');

    hook.rerender({ deps: disconnected });

    await expect(hook.result.current.confirmBatchExecution()).rejects.toThrow(
      'No Privy wallet connected',
    );
    expect(disconnected.signPreviewTypedData).not.toHaveBeenCalled();
    expect(mocks.sendPrivyAtomicBatch).not.toHaveBeenCalled();

    act(() => hook.result.current.cancelBatchExecution());
    await expect(execution).rejects.toThrow();
  });

  it(
    'fails closed if the Privy access token expires between preview and confirmation',
    async () => {
      mocks.preparePrivyAtomicBatch.mockResolvedValue(preview);
      const connected = makeDeps(WALLET_ADDRESS);
      const hook = renderHook(() => useAtomicBatchExecution(connected));

      let execution: Promise<unknown> | undefined;
      await act(async () => {
        execution = hook.result.current.executeAtomicBatch([transaction], 8453);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(hook.result.current.simulationPreview?.status).toBe('passed');

      vi.mocked(connected.getAccessToken).mockResolvedValue(null);

      await expect(
        hook.result.current.confirmBatchExecution(),
      ).rejects.toThrow(
        'Privy user access token is invalid or expired. Please re-login.',
      );
      expect(connected.signPreviewTypedData).toHaveBeenCalledOnce();
      expect(connected.generateAuthorizationSignature).toHaveBeenCalledOnce();
      expect(mocks.sendPrivyAtomicBatch).not.toHaveBeenCalled();

      act(() => hook.result.current.cancelBatchExecution());
      await expect(execution).rejects.toThrow();
    },
  );
});