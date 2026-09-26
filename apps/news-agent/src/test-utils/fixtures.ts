import type {
  DepositPlan,
  PlanOrchestrationDepositReviewResponse,
  PreparedTransaction,
} from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi, keccak256, parseAbi } from 'viem';
import { vi } from 'vitest';

import type { SigningPayload, TxmTransaction } from '../lib/multibaas.js';
import { AMOUNT, USDC, VAULT } from '../services/demoRule.js';
import { fingerprint } from '../services/guard.js';
import type { Action, Store } from '../services/types.js';

export const wallet: `0x${string}` =
  '0x1111111111111111111111111111111111111111';
export const now = Date.parse('2026-09-26T00:00:00Z');
export const hash = `0x${'ab'.repeat(32)}`;
export const depositAbi = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
]);
export function deposit(
  amount = AMOUNT,
  receiver: `0x${string}` = wallet,
): PreparedTransaction {
  return {
    chainId: 8453,
    to: VAULT,
    data: encodeFunctionData({
      abi: depositAbi,
      functionName: 'deposit',
      args: [amount, receiver],
    }),
    value: '0',
    meta: { intentType: 'deposit' },
  };
}
export function approvedReview(
  approve = false,
): PlanOrchestrationDepositReviewResponse & { plan: DepositPlan } {
  const calls = [deposit()];
  const approvals = approve
    ? [
        {
          ...calls[0]!,
          to: USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [VAULT, AMOUNT],
          }),
        },
      ]
    : [];
  return {
    plan: {
      approvals,
      calls,
      legs: [],
      totalGasUsd: '0.01',
      sourceChainId: 8453,
    },
    planFingerprint: hash,
    reviewedAt: now,
    expiresAt: now + 300_000,
    reviews: {
      'chain-8453': {
        status: 'passed',
        groupId: 'chain-8453',
        groupFingerprint: hash,
        batchFingerprint: fingerprint(8453, [...approvals, ...calls]),
        reviewedAt: now,
        expiresAt: now + 300_000,
        expectedSimulationFingerprint: hash,
        expectedRiskHash: hash,
        blocked: false,
        executionAllowed: true,
        requiresRiskAcknowledgement: false,
        chainId: 8453,
        walletAddress: wallet,
        calls: [],
        assetChanges: [],
        approvals: [],
        contracts: [],
        warnings: [],
        blockNumber: 1,
        callGas: '100000',
        simulationIds: ['simulation'],
        shareUrls: [],
        simulationFingerprint: hash,
        riskHash: hash,
      },
    },
  };
}
export function action(patch: Partial<Action> = {}): Action {
  return {
    id: 'action-1',
    episode_id: '11111111-1111-4111-8111-111111111111',
    rule_version: 'bitget-eth-pressure-v1/demo',
    status: 'approved',
    decision: null,
    review: null,
    steps: [],
    wallet_address: wallet,
    claim_token: null,
    lease_expires_at: null,
    attempt_count: 0,
    next_attempt_at: new Date(now).toISOString(),
    last_error: null,
    notified_at: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    ...patch,
  };
}
export function payload(tx = deposit(), nonce = 7): SigningPayload {
  return {
    from: wallet,
    to: tx.to,
    value: tx.value,
    data: tx.data,
    nonce,
    gas: 100000,
    type: 2,
    gasFeeCap: '10',
    gasTipCap: '1',
  };
}
export function persistedStep(tx = deposit(), nonce = 7) {
  return {
    status: 'submitting' as const,
    nonce,
    to: tx.to,
    value: tx.value,
    dataHash: keccak256(tx.data as `0x${string}`),
    payload: payload(tx, nonce),
  };
}
export function txm(p = payload()): TxmTransaction {
  return {
    from: wallet,
    tx: {
      hash,
      nonce: `0x${p.nonce.toString(16)}`,
      to: p.to,
      input: p.data,
      value: p.value,
    },
    status: 'included',
    failed: false,
  };
}
export function memoryStore(initial = action()) {
  let row = structuredClone(initial);
  const writes: Partial<Action>[] = [];
  const store: Store = {
    discover: vi.fn().mockResolvedValue([
      {
        id: initial.episode_id,
        title: 'Bitget',
        raw_text: 'fixture',
        source_url: 'https://example.com/news',
      },
    ]),
    episode: vi.fn().mockResolvedValue({
      id: initial.episode_id,
      title: 'Bitget',
      raw_text: 'fixture',
      source_url: 'https://example.com/news',
    }),
    insert: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    cas: vi.fn(async (expected: Action, patch: Partial<Action>) => {
      if (
        expected.status !== row.status ||
        expected.claim_token !== row.claim_token ||
        expected.updated_at !== row.updated_at ||
        expected.notified_at !== row.notified_at
      )
        return null;
      writes.push(structuredClone(patch));
      row = structuredClone({ ...row, ...patch });
      return structuredClone(row);
    }),
    notificationContext: vi.fn().mockResolvedValue({
      videoStatus: 'completed',
      videoChat: '123',
      ingestChat: '456',
    }),
  };
  return {
    store,
    writes,
    get row() {
      return row;
    },
  };
}
