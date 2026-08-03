import {
  checkReviewedBatchGuards,
  reviewedBatchKey,
  runDeduplicatedReviewedExecution,
} from '@core/lib/wallet/reviewedBatchExecution';
import { computeReviewedBatchFingerprint } from '@core/lib/wallet/reviewedBatchFingerprint';
import type {
  WalletReviewedBatchInput,
  WalletReviewedBatchResult,
} from '@core/types';
import type { PreparedTransaction } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

const WALLET_ADDRESS = '0x2222222222222222222222222222222222222222';
const EXPECTED_SIMULATION_FINGERPRINT = `0x${'ab'.repeat(32)}`;
const EXPECTED_RISK_HASH = `0x${'cd'.repeat(32)}`;

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

function input(
  overrides: Partial<WalletReviewedBatchInput> = {},
): WalletReviewedBatchInput {
  return {
    transactions: [tx()],
    chainId: 8453,
    expectedWalletAddress: WALLET_ADDRESS,
    expectedBatchFingerprint: computeReviewedBatchFingerprint({
      chainId: 8453,
      transactions: [tx()],
    }),
    expiresAt: Date.now() + 60_000,
    executionAllowed: true,
    expectedSimulationFingerprint: EXPECTED_SIMULATION_FINGERPRINT,
    expectedRiskHash: EXPECTED_RISK_HASH,
    requiresRiskAcknowledgement: false,
    ...overrides,
  };
}

describe('checkReviewedBatchGuards', () => {
  it('blocks when no wallet is connected', () => {
    const guard = checkReviewedBatchGuards(input(), undefined);
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'WALLET_NOT_CONNECTED' },
    });
  });

  it('blocks when the review forbids execution', () => {
    const guard = checkReviewedBatchGuards(
      input({ executionAllowed: false }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'REVIEW_BLOCKED' },
    });
  });

  it('flags a connected-wallet mismatch as review-changed', () => {
    const guard = checkReviewedBatchGuards(
      input(),
      '0x3333333333333333333333333333333333333333',
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'review-changed', reason: 'wallet-address-mismatch' },
    });
  });

  it('blocks an empty batch', () => {
    const guard = checkReviewedBatchGuards(
      input({ transactions: [] }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'EMPTY_BATCH' },
    });
  });

  it('blocks an expired review', () => {
    const guard = checkReviewedBatchGuards(
      input({ expiresAt: Date.now() - 1 }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'REVIEW_EXPIRED' },
    });
  });

  it('blocks a review missing its safety hashes', () => {
    const guard = checkReviewedBatchGuards(
      input({ expectedRiskHash: '' }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'REVIEW_HASH_MISSING' },
    });
  });

  it('blocks a warning review without the matching acknowledgement', () => {
    const guard = checkReviewedBatchGuards(
      input({
        requiresRiskAcknowledgement: true,
        acknowledgedRiskHash: `0x${'00'.repeat(32)}`,
      }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'RISK_ACKNOWLEDGEMENT_REQUIRED' },
    });
  });

  it('passes a warning review once the acknowledged risk hash matches', () => {
    const guard = checkReviewedBatchGuards(
      input({
        requiresRiskAcknowledgement: true,
        acknowledgedRiskHash: EXPECTED_RISK_HASH,
      }),
      WALLET_ADDRESS,
    );
    expect(guard).toEqual({ ok: true, connectedAddress: WALLET_ADDRESS });
  });

  it('blocks a batch that mixes chains', () => {
    const guard = checkReviewedBatchGuards(
      input({ transactions: [tx(), tx({ chainId: 42161 })] }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: { status: 'blocked', code: 'CROSS_CHAIN_BATCH' },
    });
  });

  it('flags a batch fingerprint mismatch as review-changed', () => {
    const guard = checkReviewedBatchGuards(
      input({ transactions: [tx({ value: '1' })] }),
      WALLET_ADDRESS,
    );
    expect(guard).toMatchObject({
      ok: false,
      result: {
        status: 'review-changed',
        reason: 'batch-fingerprint-mismatch',
      },
    });
  });

  it('passes an untouched review with a connected wallet', () => {
    const guard = checkReviewedBatchGuards(input(), WALLET_ADDRESS);
    expect(guard).toEqual({ ok: true, connectedAddress: WALLET_ADDRESS });
  });
});

describe('reviewedBatchKey', () => {
  it('is stable across re-renders and case-insensitive for addresses', () => {
    const review = input();
    const a = reviewedBatchKey(review);
    const b = reviewedBatchKey({
      ...review,
      expectedWalletAddress: WALLET_ADDRESS.toUpperCase(),
    });
    expect(a).toBe(b);
  });

  it('differs when the batch changes', () => {
    const a = reviewedBatchKey(input());
    const b = reviewedBatchKey(input({ transactions: [tx({ value: '1' })] }));
    expect(a).not.toBe(b);
  });
});

describe('runDeduplicatedReviewedExecution', () => {
  it('reuses the in-flight promise for an identical reviewed batch', async () => {
    const tracker = new Map();
    const executor = vi.fn(
      async (): Promise<WalletReviewedBatchResult> => ({
        status: 'submitted',
        callsId: 'calls-1',
      }),
    );
    const key = 'key-1';

    const first = runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );
    const second = runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );

    expect(first).toBe(second);
    expect(executor).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toEqual({
      status: 'submitted',
      callsId: 'calls-1',
    });
  });

  it('clears a non-submitted result so a later attempt can run', async () => {
    const tracker = new Map();
    const executor = vi.fn(
      async (): Promise<WalletReviewedBatchResult> => ({
        status: 'blocked',
        reason: 'nope',
      }),
    );
    const key = 'key-2';

    await runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );
    expect(tracker.size).toBe(0);
    const second = runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );
    expect(second).toBeDefined();
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('keeps a submitted entry until its review expires', async () => {
    const tracker = new Map();
    const executor = vi.fn(
      async (): Promise<WalletReviewedBatchResult> => ({
        status: 'submitted',
        callsId: 'calls-1',
      }),
    );
    const key = 'key-3';

    await runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );
    expect(tracker.size).toBe(1);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('re-runs when the tracked entry has already expired', async () => {
    const tracker = new Map();
    const executor = vi.fn(
      async (): Promise<WalletReviewedBatchResult> => ({
        status: 'submitted',
        callsId: 'calls-1',
      }),
    );
    const key = 'key-4';
    tracker.set(key, {
      promise: Promise.resolve({
        status: 'submitted' as const,
        callsId: 'stale',
      }),
      expiresAt: Date.now() - 1,
    });

    const result = runDeduplicatedReviewedExecution(
      tracker,
      key,
      Date.now() + 60_000,
      executor,
    );
    expect(executor).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual({
      status: 'submitted',
      callsId: 'calls-1',
    });
  });
});
