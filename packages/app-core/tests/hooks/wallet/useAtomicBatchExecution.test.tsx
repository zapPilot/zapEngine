// @vitest-environment jsdom
import {
  type AtomicBatchExecutionDeps,
  useAtomicBatchExecution,
} from '@core/hooks/wallet/useAtomicBatchExecution';
import { computeReviewedBatchFingerprint } from '@core/lib/wallet/reviewedBatchFingerprint';
import type { WalletAtomicBatchResult } from '@core/types';
import { act, renderHook, type RenderHookResult } from '@testing-library/react';
import type {
  PreparedTransaction,
  PrivyPrepareSendCallsResponse,
} from '@zapengine/types/api';
import { decodeFunctionData, erc20Abi } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const SPENDER = '0x9999999999999999999999999999999999999999' as const;
const RISK_HASH = `0x${'ab'.repeat(32)}`;
const SIMULATION_FINGERPRINT = `0x${'cd'.repeat(32)}`;

function tx(overrides: Partial<PreparedTransaction> = {}): PreparedTransaction {
  return {
    to: '0x1111111111111111111111111111111111111111',
    data: '0x',
    value: '0',
    chainId: 8453,
    meta: { intentType: 'swap' },
    ...overrides,
  };
}

const BATCH_FINGERPRINT = computeReviewedBatchFingerprint({
  chainId: 8453,
  transactions: [tx()],
});

function preview(
  overrides: Record<string, unknown> = {},
): PrivyPrepareSendCallsResponse {
  return {
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
    simulationFingerprint: SIMULATION_FINGERPRINT,
    riskHash: RISK_HASH,
    ...overrides,
  } as unknown as PrivyPrepareSendCallsResponse;
}

function makeDeps(
  overrides: Partial<AtomicBatchExecutionDeps> = {},
): AtomicBatchExecutionDeps {
  return {
    getAccessToken: vi.fn(async () => 'access-token'),
    signPreviewTypedData: vi.fn(async () => '0xusersig' as `0x${string}`),
    generateAuthorizationSignature: vi.fn(async () => ({
      signature: 'authsig',
    })),
    ensureChain: vi.fn(async () => {}),
    resolveWalletId: vi.fn(() => 'wallet-id'),
    walletAddress: WALLET_ADDRESS,
    ...overrides,
  };
}

type HookResult = RenderHookResult<
  ReturnType<typeof useAtomicBatchExecution>,
  { deps: AtomicBatchExecutionDeps }
>;

function renderExecutionHook(deps: AtomicBatchExecutionDeps): HookResult {
  return renderHook(({ deps: current }) => useAtomicBatchExecution(current), {
    initialProps: { deps },
  });
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

interface HeldExecution {
  value?: WalletAtomicBatchResult;
  error?: Error;
  settled: boolean;
}

async function startExecution(
  hook: HookResult,
  transactions: PreparedTransaction[] = [tx()],
  chainId = 8453,
): Promise<HeldExecution> {
  const held: HeldExecution = { settled: false };
  await act(async () => {
    void hook.result.current.executeAtomicBatch(transactions, chainId).then(
      (value) => {
        held.value = value;
        held.settled = true;
      },
      (error: Error) => {
        held.error = error;
        held.settled = true;
      },
    );
    await flush();
  });
  return held;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preparePrivyAtomicBatch.mockResolvedValue(preview());
  mocks.sendPrivyAtomicBatch.mockResolvedValue({
    status: 'submitted',
    transactionId: 'txn-1',
    caip2: 'eip155:8453',
    transactionHash: `0x${'cd'.repeat(32)}`,
  });
});

describe('executeAtomicBatch', () => {
  it('prepares the batch and holds the promise until the UI decides', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);

    const held = await startExecution(hook);

    expect(deps.ensureChain).toHaveBeenCalledWith(8453);
    expect(mocks.preparePrivyAtomicBatch).toHaveBeenCalledTimes(1);
    const [batch, token] = mocks.preparePrivyAtomicBatch.mock.calls[0];
    expect(token).toBe('access-token');
    expect(batch).toMatchObject({
      walletId: 'wallet-id',
      walletAddress: WALLET_ADDRESS,
      chainId: 8453,
      calls: [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x',
          value: '0x0',
        },
      ],
    });
    expect(batch.idempotencyKey).toBeTruthy();
    expect(hook.result.current.simulationPreview?.status).toBe('passed');
    expect(held.settled).toBe(false);
  });

  it.each([
    {
      name: 'no wallet connected',
      deps: makeDeps({ walletAddress: undefined }),
      transactions: [tx()],
      chainId: 8453,
      message: 'No Privy wallet connected',
    },
    {
      name: 'empty batch',
      deps: makeDeps(),
      transactions: [],
      chainId: 8453,
      message: 'Cannot execute empty Privy EIP-7702 batch',
    },
    {
      name: 'unsupported chain',
      deps: makeDeps(),
      transactions: [tx({ chainId: 10 })],
      chainId: 10,
      message: 'not configured for chain 10',
    },
    {
      name: 'cross-chain transaction in batch',
      deps: makeDeps(),
      transactions: [tx({ chainId: 42161 })],
      chainId: 8453,
      message: 'transaction for chain 42161, expected 8453',
    },
    {
      name: 'missing wallet resource id',
      deps: makeDeps({ resolveWalletId: vi.fn(() => undefined) }),
      transactions: [tx()],
      chainId: 8453,
      message: 'Privy wallet resource id is unavailable',
    },
    {
      name: 'expired access token',
      deps: makeDeps({ getAccessToken: vi.fn(async () => null) }),
      transactions: [tx()],
      chainId: 8453,
      message: 'Privy user access token is invalid or expired',
    },
  ])('rejects on $name', async ({ deps, transactions, chainId, message }) => {
    const hook = renderExecutionHook(deps);
    await act(async () => {
      await expect(
        hook.result.current.executeAtomicBatch(transactions, chainId),
      ).rejects.toThrow(message);
    });
    expect(hook.result.current.simulationPreview).toBeNull();
  });

  it('wraps preparation failures with the batch context', async () => {
    mocks.preparePrivyAtomicBatch.mockRejectedValue(new Error('HTTP 503'));
    const hook = renderExecutionHook(makeDeps());
    await act(async () => {
      await expect(
        hook.result.current.executeAtomicBatch([tx()], 8453),
      ).rejects.toThrow(
        'Privy EOA EIP-7702 atomic batch preparation failed: HTTP 503',
      );
    });
  });
});

describe('executeReviewedBatch', () => {
  it('blocks a failed or unavailable review before preparing or prompting', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);

    let result: Awaited<
      ReturnType<typeof hook.result.current.executeReviewedBatch>
    >;
    await act(async () => {
      result = await hook.result.current.executeReviewedBatch({
        transactions: [tx()],
        chainId: 8453,
        expectedWalletAddress: WALLET_ADDRESS,
        expectedBatchFingerprint: BATCH_FINGERPRINT,
        expiresAt: Date.now() + 60_000,
        executionAllowed: false,
        expectedSimulationFingerprint: SIMULATION_FINGERPRINT,
        expectedRiskHash: RISK_HASH,
        requiresRiskAcknowledgement: false,
      });
    });

    expect(result).toMatchObject({ status: 'blocked', code: 'REVIEW_BLOCKED' });
    expect(deps.ensureChain).not.toHaveBeenCalled();
    expect(mocks.preparePrivyAtomicBatch).not.toHaveBeenCalled();
    expect(deps.signPreviewTypedData).not.toHaveBeenCalled();
  });

  it('matches both review hashes before signing and submits headlessly', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);

    let result: Awaited<
      ReturnType<typeof hook.result.current.executeReviewedBatch>
    >;
    await act(async () => {
      result = await hook.result.current.executeReviewedBatch({
        transactions: [tx()],
        chainId: 8453,
        expectedWalletAddress: WALLET_ADDRESS,
        expectedBatchFingerprint: BATCH_FINGERPRINT,
        expiresAt: Date.now() + 60_000,
        executionAllowed: true,
        expectedSimulationFingerprint: SIMULATION_FINGERPRINT,
        expectedRiskHash: RISK_HASH,
        requiresRiskAcknowledgement: false,
      });
    });

    expect(result!).toMatchObject({ status: 'submitted', callsId: 'txn-1' });
    expect(deps.signPreviewTypedData).toHaveBeenCalledTimes(1);
    expect(deps.generateAuthorizationSignature).toHaveBeenCalledTimes(1);
    expect(mocks.sendPrivyAtomicBatch).toHaveBeenCalledTimes(1);
    expect(hook.result.current.simulationPreview).toBeNull();
  });

  it('returns review-changed without signing when the prepared fingerprint drifts', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);
    mocks.preparePrivyAtomicBatch.mockResolvedValueOnce(
      preview({ simulationFingerprint: `0x${'ef'.repeat(32)}` }),
    );

    let result: Awaited<
      ReturnType<typeof hook.result.current.executeReviewedBatch>
    >;
    await act(async () => {
      result = await hook.result.current.executeReviewedBatch({
        transactions: [tx()],
        chainId: 8453,
        expectedWalletAddress: WALLET_ADDRESS,
        expectedBatchFingerprint: BATCH_FINGERPRINT,
        expiresAt: Date.now() + 60_000,
        executionAllowed: true,
        expectedSimulationFingerprint: SIMULATION_FINGERPRINT,
        expectedRiskHash: RISK_HASH,
        requiresRiskAcknowledgement: false,
      });
    });

    expect(result).toMatchObject({ status: 'review-changed' });
    expect(deps.signPreviewTypedData).not.toHaveBeenCalled();
    expect(deps.generateAuthorizationSignature).not.toHaveBeenCalled();
    expect(mocks.sendPrivyAtomicBatch).not.toHaveBeenCalled();
  });

  it('surfaces server-side drift without attempting a second broadcast', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);
    mocks.sendPrivyAtomicBatch.mockResolvedValueOnce({
      status: 'review',
      preview: preview({
        previewId: 'preview-2',
        simulationFingerprint: `0x${'ef'.repeat(32)}`,
      }),
    });

    let result: Awaited<
      ReturnType<typeof hook.result.current.executeReviewedBatch>
    >;
    await act(async () => {
      result = await hook.result.current.executeReviewedBatch({
        transactions: [tx()],
        chainId: 8453,
        expectedWalletAddress: WALLET_ADDRESS,
        expectedBatchFingerprint: BATCH_FINGERPRINT,
        expiresAt: Date.now() + 60_000,
        executionAllowed: true,
        expectedSimulationFingerprint: SIMULATION_FINGERPRINT,
        expectedRiskHash: RISK_HASH,
        requiresRiskAcknowledgement: false,
      });
    });

    expect(result).toMatchObject({
      status: 'review-changed',
      reason: 'server-review-changed',
    });
    expect(mocks.sendPrivyAtomicBatch).toHaveBeenCalledTimes(1);
  });
});

describe('confirmBatchExecution', () => {
  it('signs, authorizes, confirms, and resolves the held promise', async () => {
    const deps = makeDeps();
    const hook = renderExecutionHook(deps);
    const held = await startExecution(hook);

    await act(async () => {
      await hook.result.current.confirmBatchExecution();
    });

    expect(deps.signPreviewTypedData).toHaveBeenCalledWith({
      domain: {},
      types: {},
      primaryType: 'ZapPilotIntent',
      message: {},
    });
    expect(deps.generateAuthorizationSignature).toHaveBeenCalledTimes(1);
    const payload = (
      deps.generateAuthorizationSignature as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as Uint8Array;
    expect([...payload]).toEqual([104, 101, 108, 108, 111]);
    expect(mocks.sendPrivyAtomicBatch).toHaveBeenCalledWith(
      {
        previewId: 'preview-1',
        userSignature: '0xusersig',
        authorizationSignature: 'authsig',
      },
      'access-token',
    );

    await act(flush);
    expect(held.value).toEqual({
      callsId: 'txn-1',
      transactionHash: `0x${'cd'.repeat(32)}`,
    });
    expect(hook.result.current.simulationPreview).toBeNull();
    expect(hook.result.current.batchExecutionPhase).toBe('idle');
    expect(hook.result.current.isSigningAndSending).toBe(false);
  });

  it('exposes each signing and sending phase while confirmation progresses', async () => {
    const signing = deferred<`0x${string}`>();
    const authorizing = deferred<{ signature: string }>();
    const sending = deferred<{
      status: 'submitted';
      transactionId: string;
      caip2: string;
    }>();
    const deps = makeDeps({
      signPreviewTypedData: vi.fn(() => signing.promise),
      generateAuthorizationSignature: vi.fn(() => authorizing.promise),
    });
    mocks.sendPrivyAtomicBatch.mockImplementation(() => sending.promise);
    const hook = renderExecutionHook(deps);
    await startExecution(hook);

    let confirmation!: Promise<void>;
    act(() => {
      confirmation = hook.result.current.confirmBatchExecution();
    });
    expect(hook.result.current.batchExecutionPhase).toBe('signingIntent');

    await act(async () => {
      signing.resolve('0xusersig');
      await flush();
    });
    expect(hook.result.current.batchExecutionPhase).toBe('authorizingBatch');

    await act(async () => {
      authorizing.resolve({ signature: 'authsig' });
      await flush();
    });
    expect(hook.result.current.batchExecutionPhase).toBe('sendingBatch');

    await act(async () => {
      sending.resolve({
        status: 'submitted',
        transactionId: 'txn-phase-test',
        caip2: 'eip155:8453',
      });
      await confirmation;
    });
    expect(hook.result.current.batchExecutionPhase).toBe('idle');
  });

  it('forwards the acknowledged risk hash for warning previews', async () => {
    mocks.preparePrivyAtomicBatch.mockResolvedValue(
      preview({ status: 'warning' }),
    );
    const hook = renderExecutionHook(makeDeps());
    await startExecution(hook);

    await act(async () => {
      await hook.result.current.confirmBatchExecution(RISK_HASH);
    });

    expect(mocks.sendPrivyAtomicBatch.mock.calls[0][0]).toMatchObject({
      acknowledgedRiskHash: RISK_HASH,
    });
  });

  it('keeps the execution pending when the server answers with a fresh review', async () => {
    const refreshed = preview({ previewId: 'preview-2', status: 'warning' });
    mocks.sendPrivyAtomicBatch.mockResolvedValueOnce({
      status: 'review',
      preview: refreshed,
    });
    const hook = renderExecutionHook(makeDeps());
    const held = await startExecution(hook);

    await act(async () => {
      await hook.result.current.confirmBatchExecution();
    });

    expect(held.settled).toBe(false);
    expect(hook.result.current.simulationPreview?.previewId).toBe('preview-2');

    await act(async () => {
      await hook.result.current.confirmBatchExecution(RISK_HASH);
    });
    await act(flush);
    expect(held.value?.callsId).toBe('txn-1');
    expect(mocks.sendPrivyAtomicBatch.mock.calls[1][0]).toMatchObject({
      previewId: 'preview-2',
    });
  });

  it.each([
    {
      status: 'failed',
      reason: { failureReason: 'Simulation reverted' },
    },
    {
      status: 'unavailable',
      reason: { unavailableReason: 'Tenderly is unavailable' },
    },
  ] as const)(
    'does nothing for $status previews',
    async ({ status, reason }) => {
      mocks.preparePrivyAtomicBatch.mockResolvedValue(
        preview({ status, ...reason }),
      );
      const hook = renderExecutionHook(makeDeps());
      const held = await startExecution(hook);

      await act(async () => {
        await hook.result.current.confirmBatchExecution();
      });

      expect(mocks.sendPrivyAtomicBatch).not.toHaveBeenCalled();
      expect(held.settled).toBe(false);
      expect(hook.result.current.simulationPreview?.status).toBe(status);
    },
  );

  it('rejects the held promise when confirmation fails', async () => {
    mocks.sendPrivyAtomicBatch.mockRejectedValue(
      new Error('preview has expired'),
    );
    const hook = renderExecutionHook(makeDeps());
    const held = await startExecution(hook);

    await act(async () => {
      await hook.result.current.confirmBatchExecution();
    });
    await act(flush);

    expect(held.error?.message).toBe('preview has expired');
    expect(hook.result.current.simulationPreview).toBeNull();
    expect(hook.result.current.batchExecutionPhase).toBe('idle');
  });
});

describe('cancelBatchExecution', () => {
  it('rejects the held promise with the user-rejection message', async () => {
    const hook = renderExecutionHook(makeDeps());
    const held = await startExecution(hook);

    await act(async () => {
      hook.result.current.cancelBatchExecution();
      await flush();
    });

    expect(held.error?.message).toBe('Transaction rejected by the user.');
    expect(hook.result.current.simulationPreview).toBeNull();
  });
});

describe('retryBatchSimulation', () => {
  it('replaces the preview on success', async () => {
    const hook = renderExecutionHook(makeDeps());
    await startExecution(hook);
    mocks.preparePrivyAtomicBatch.mockResolvedValueOnce(
      preview({ previewId: 'preview-2' }),
    );

    await act(async () => {
      await hook.result.current.retryBatchSimulation();
    });

    expect(hook.result.current.simulationPreview?.previewId).toBe('preview-2');
    expect(hook.result.current.retryError).toBeNull();
  });

  it('records the failure and keeps the previous preview', async () => {
    const hook = renderExecutionHook(makeDeps());
    const held = await startExecution(hook);
    mocks.preparePrivyAtomicBatch.mockRejectedValueOnce(
      new Error('Tenderly timeout'),
    );

    await act(async () => {
      await hook.result.current.retryBatchSimulation();
    });

    expect(hook.result.current.retryError).toBe('Tenderly timeout');
    expect(hook.result.current.simulationPreview?.previewId).toBe('preview-1');
    expect(held.settled).toBe(false);
  });
});

describe('updateApprovalAmount', () => {
  const approveTx = tx({
    to: '0x3333333333333333333333333333333333333333',
  });
  const approvalPreview = preview({
    approvals: [
      {
        callIndex: 0,
        owner: WALLET_ADDRESS,
        spender: SPENDER,
        token: { address: approveTx.to, symbol: 'USDC', decimals: 6 },
        rawAmount: '5000000',
        amount: '5',
        unlimited: false,
        simulatedSpendRaw: '5000000',
        exceedsSimulatedSpend: false,
      },
    ],
  });

  it('re-encodes the approve call and re-prepares with a fresh idempotency key', async () => {
    mocks.preparePrivyAtomicBatch.mockResolvedValue(approvalPreview);
    const hook = renderExecutionHook(makeDeps());
    await startExecution(hook, [approveTx]);
    const firstBatch = mocks.preparePrivyAtomicBatch.mock.calls[0][0];

    await act(async () => {
      await hook.result.current.updateApprovalAmount(0, '2.5');
    });

    expect(mocks.preparePrivyAtomicBatch).toHaveBeenCalledTimes(2);
    const secondBatch = mocks.preparePrivyAtomicBatch.mock.calls[1][0];
    expect(secondBatch.idempotencyKey).not.toBe(firstBatch.idempotencyKey);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: secondBatch.calls[0].data,
    });
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args).toEqual([SPENDER, 2_500_000n]);
  });

  it('rejects amounts that do not parse', async () => {
    mocks.preparePrivyAtomicBatch.mockResolvedValue(approvalPreview);
    const hook = renderExecutionHook(makeDeps());
    await startExecution(hook, [approveTx]);

    await act(async () => {
      await expect(
        hook.result.current.updateApprovalAmount(0, 'abc'),
      ).rejects.toThrow('Enter a valid approval amount.');
    });
    expect(hook.result.current.retryError).toBe(
      'Enter a valid approval amount.',
    );
  });

  it('rejects when the call has no matching approval', async () => {
    const hook = renderExecutionHook(makeDeps());
    await startExecution(hook);

    await act(async () => {
      await expect(
        hook.result.current.updateApprovalAmount(3, '1'),
      ).rejects.toThrow('Approval call is no longer available.');
    });
  });
});
