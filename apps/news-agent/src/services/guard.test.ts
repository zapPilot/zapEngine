import type { PlanOrchestrationRotateReviewResponse } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

import {
  approve,
  approvedReview,
  deposit,
  MIN_OUT,
  now,
  redeem,
  refingerprint,
  swap,
  SWAP_FROM,
  wallet,
} from '../test-utils/fixtures.js';
import {
  ETH_VAULT,
  LIFI_DIAMOND,
  rotateRequest,
  RULE_EXPIRES_AT,
  SHARES,
  USDC,
  USDC_VAULT,
  WETH,
} from './demoRule.js';
import { guard } from './guard.js';

type Review = PlanOrchestrationRotateReviewResponse;
const group = (review: Review) => review.reviews['chain-8453']!;
const other: `0x${string}` = '0x3333333333333333333333333333333333333333';

describe('fixed rotation guard', () => {
  it.each([
    ['no approvals', { approveWeth: false }],
    ['the WETH approval', { approveWeth: true }],
    ['both approvals', { approveWeth: true, approveUsdc: true }],
  ])('permits the exact reviewed rotation with %s', (_, options) => {
    const verdict = guard(approvedReview(options), wallet, now);
    expect(verdict).toMatchObject({ allowed: true, depositAmount: MIN_OUT });
    expect(verdict.transactions.at(-1)!.to).toBe(USDC_VAULT);
  });

  it('asks plan-orchestration for exactly the fixed rotation', () => {
    expect(rotateRequest(wallet)).toEqual({
      userAddress: wallet,
      chainId: 8453,
      fromVault: ETH_VAULT,
      toVault: USDC_VAULT,
      shareAmount: SHARES.toString(),
    });
  });

  it('accepts a review that decoded every call', () => {
    const review = approvedReview();
    Object.assign(group(review), {
      status: 'passed',
      warnings: [],
      requiresRiskAcknowledgement: false,
    });
    expect(guard(review, wallet, now).allowed).toBe(true);
  });

  it.each(['failed', 'unavailable'])('rejects %s reviews', (status) => {
    const review = approvedReview();
    Object.assign(group(review), { status });
    expect(guard(review, wallet, now).reason).toBe('Review did not pass');
  });

  it.each<[string, (review: Review) => void]>([
    [
      'an unlimited-approval warning',
      (r) => {
        group(r).warnings.push({
          code: 'UNLIMITED_APPROVAL',
          message: 'unlimited',
          callIndex: 0,
        });
      },
    ],
    [
      'an undecoded call other than the swap',
      (r) => {
        group(r).warnings[0]!.callIndex = 1;
      },
    ],
    [
      'an undecoded call on another contract',
      (r) => {
        group(r).warnings[0]!.address = other;
      },
    ],
    [
      'a warning without a risk acknowledgement',
      (r) => {
        group(r).requiresRiskAcknowledgement = false;
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const review = approvedReview();
    mutate(review);
    expect(guard(review, wallet, now).reason).toBe('Review did not pass');
  });

  it.each<[string, (review: Review) => void, string]>([
    [
      'chain',
      (r) => {
        r.plan.calls[1]!.chainId = 1;
      },
      'Wrong chain',
    ],
    [
      'native value',
      (r) => {
        r.plan.calls[1]!.value = '1';
      },
      'Native value forbidden',
    ],
    [
      'source vault',
      (r) => {
        r.plan.calls[0]!.to = USDC_VAULT;
      },
      'Unexpected source vault',
    ],
    ...(
      [
        ['redeem shares', redeem(SHARES + 1n)],
        ['redeem receiver', redeem(SHARES, other)],
        ['redeem owner', redeem(SHARES, wallet, other)],
      ] as const
    ).map(
      ([name, call]) =>
        [
          name,
          (r: Review) => {
            r.plan.calls[0] = call;
          },
          'Wrong redeem shares, receiver or owner',
        ] as [string, (review: Review) => void, string],
    ),
    [
      'swap target',
      (r) => {
        r.plan.calls[1] = swap({ to: other });
      },
      'Unexpected swap target',
    ],
    [
      'swap receiver',
      (r) => {
        r.plan.calls[1] = swap({ receiver: other });
      },
      'Swap pays someone else',
    ],
    [
      'swap output token',
      (r) => {
        r.plan.calls[1] = swap({ receivingAssetId: WETH });
      },
      'Swap must sell WETH for USDC',
    ],
    [
      'swap minimum',
      (r) => {
        r.plan.calls[1] = swap({ minOut: 0n });
      },
      'Swap has no minimum output',
    ],
    [
      'swap facet',
      (r) => {
        r.plan.calls[1]!.data = '0x12345678';
      },
      'Malformed review or calldata',
    ],
    [
      'destination vault',
      (r) => {
        r.plan.calls[2] = deposit(MIN_OUT, wallet, ETH_VAULT);
      },
      'Unexpected destination vault',
    ],
    [
      'deposit amount',
      (r) => {
        r.plan.calls[2] = deposit(MIN_OUT + 1n);
      },
      'Deposit must be the swap minimum, for the agent',
    ],
    [
      'deposit receiver',
      (r) => {
        r.plan.calls[2] = deposit(MIN_OUT, other);
      },
      'Deposit must be the swap minimum, for the agent',
    ],
    [
      'step count',
      (r) => {
        r.plan.calls.pop();
      },
      'Unexpected steps',
    ],
    [
      'swap approval amount',
      (r) => {
        r.plan.approvals[0] = approve(WETH, LIFI_DIAMOND, SWAP_FROM + 1n);
      },
      'Unexpected approval',
    ],
    [
      'swap approval spender',
      (r) => {
        r.plan.approvals[0] = approve(WETH, other, SWAP_FROM);
      },
      'Unexpected approval',
    ],
    [
      'approval token',
      (r) => {
        r.plan.approvals[0] = approve(ETH_VAULT, LIFI_DIAMOND, SWAP_FROM);
      },
      'Unexpected approval token',
    ],
    [
      'deposit approval amount',
      (r) => {
        r.plan.approvals.push(approve(USDC, USDC_VAULT, MIN_OUT + 1n));
      },
      'Unexpected approval',
    ],
    [
      'duplicate approval',
      (r) => {
        r.plan.approvals.push(r.plan.approvals[0]!);
      },
      'Unexpected approval token',
    ],
    [
      'review group count',
      (r) => {
        r.reviews['other'] = group(r);
      },
      'Unexpected review groups',
    ],
    [
      'blocked review',
      (r) => {
        group(r).blocked = true;
      },
      'Review did not pass',
    ],
    [
      'disallowed review',
      (r) => {
        group(r).executionAllowed = false;
      },
      'Review did not pass',
    ],
    [
      'review wallet',
      (r) => {
        group(r).walletAddress = other;
      },
      'Review wallet or chain mismatch',
    ],
    [
      'review chain',
      (r) => {
        group(r).chainId = 1;
      },
      'Review wallet or chain mismatch',
    ],
    [
      'group expiry',
      (r) => {
        group(r).expiresAt = now + 60_000;
      },
      'Group review expires too soon',
    ],
    [
      'review expiry',
      (r) => {
        r.expiresAt = now + 60_000;
      },
      'Review expires too soon',
    ],
  ])('rejects a wrong %s', (_, mutate, reason) => {
    const review = approvedReview();
    mutate(review);
    refingerprint(review);
    expect(guard(review, wallet, now).reason).toBe(reason);
  });

  it('rejects an expired rule, a tampered batch and malformed numbers', () => {
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
});
