import { encodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  approvedReview,
  deposit,
  now,
  wallet,
} from '../test-utils/fixtures.js';
import {
  AMOUNT,
  hasKeyword,
  planRequest,
  RULE_EXPIRES_AT,
  VAULT,
} from './demoRule.js';
import { fingerprint, guard } from './guard.js';

describe('fixed demo guard', () => {
  it('permits the exact reviewed deposit with optional approval', () => {
    for (const approve of [true, false])
      expect(guard(approvedReview(approve), wallet, now).allowed).toBe(true);
    expect(planRequest(wallet)).toMatchObject({
      fromAmount: '1000000',
      split: { '8453': 1 },
    });
    expect(hasKeyword('BITGET', '')).toBe(true);
    expect(hasKeyword('', 'bitget 新聞')).toBe(true);
  });
  it.each(['warning', 'failed', 'unavailable'])(
    'rejects %s reviews',
    (status) => {
      const review = approvedReview();
      Object.assign(review.reviews['chain-8453']!, { status });
      expect(guard(review, wallet, now).allowed).toBe(false);
    },
  );
  it.each([
    [
      'chain',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0]!.chainId = 1;
      },
    ],
    [
      'value',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0]!.value = '1';
      },
    ],
    [
      'target',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0]!.to = wallet;
      },
    ],
    [
      'amount',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0] = deposit(AMOUNT + 1n);
      },
    ],
    [
      'receiver',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0] = deposit(AMOUNT, VAULT);
      },
    ],
    [
      'malformed',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls[0]!.data = '0x';
      },
    ],
    [
      'empty',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls = [];
      },
    ],
    [
      'many calls',
      (r: ReturnType<typeof approvedReview>) => {
        r.plan.calls.push(deposit());
      },
    ],
    [
      'extra group',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['other'] = r.reviews['chain-8453']!;
      },
    ],
    [
      'execution disallowed',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.executionAllowed = false;
      },
    ],
    [
      'blocked',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.blocked = true;
      },
    ],
    [
      'risk',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.requiresRiskAcknowledgement = true;
      },
    ],
    [
      'wallet',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.walletAddress = VAULT;
      },
    ],
    [
      'review chain',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.chainId = 1;
      },
    ],
    [
      'group expiry',
      (r: ReturnType<typeof approvedReview>) => {
        r.reviews['chain-8453']!.expiresAt = now + 60_000;
      },
    ],
    [
      'expiry',
      (r: ReturnType<typeof approvedReview>) => {
        r.expiresAt = now + 60_000;
      },
    ],
  ] as const)('rejects %s', (_, mutate) => {
    const review = approvedReview();
    mutate(review);
    review.reviews['chain-8453']!.batchFingerprint = fingerprint(8453, [
      ...review.plan.approvals,
      ...review.plan.calls,
    ]);
    expect(guard(review, wallet, now).allowed).toBe(false);
  });
  it('rejects expired rule, fingerprint tampering and malformed numbers', () => {
    expect(guard(approvedReview(), wallet, RULE_EXPIRES_AT).reason).toBe(
      'Demo rule expired',
    );
    const review = approvedReview();
    review.plan.calls[0]!.data = '0x00';
    expect(guard(review, wallet, now).reason).toBe(
      'Batch fingerprint mismatch',
    );
    review.plan.calls[0]!.value = 'not a number';
    expect(guard(review, wallet, now).allowed).toBe(false);
  });
  it.each(['amount', 'spender', 'token', 'method', 'count'])(
    'rejects approval %s',
    (mode) => {
      const review = approvedReview(true);
      const approval = review.plan.approvals[0]!;
      if (mode === 'amount')
        approval.data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [VAULT, AMOUNT + 1n],
        });
      if (mode === 'spender')
        approval.data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [wallet, AMOUNT],
        });
      if (mode === 'token') approval.to = VAULT;
      if (mode === 'method')
        approval.data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [VAULT, AMOUNT],
        });
      if (mode === 'count') review.plan.approvals.push(approval);
      review.reviews['chain-8453']!.batchFingerprint = fingerprint(8453, [
        ...review.plan.approvals,
        ...review.plan.calls,
      ]);
      expect(guard(review, wallet, now).allowed).toBe(false);
    },
  );
});
