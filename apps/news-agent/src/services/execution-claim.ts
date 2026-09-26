import { randomUUID } from 'node:crypto';

import type { PlanOrchestrationDepositReviewResponse } from '@zapengine/types/api';

import { type ExecutionContext, leaseExpiry } from './execution-context.js';
import { guard } from './guard.js';

async function reviewAction(
  context: ExecutionContext,
  dryRun: boolean,
): Promise<PlanOrchestrationDepositReviewResponse | null> {
  const { d } = context;
  try {
    const review = await d.review(d.wallet);
    if (
      Object.values(review.reviews).some(
        (group) => group.status === 'unavailable',
      )
    )
      throw new Error('Review unavailable');
    return review;
  } catch {
    if (dryRun) throw new Error('Review unavailable');
    const attempts = context.action.attempt_count + 1;
    await context.save({
      attempt_count: attempts,
      status: attempts >= 3 ? 'blocked' : 'approved',
      last_error: 'Review unavailable',
      next_attempt_at: new Date(d.now() + 30_000 * 2 ** attempts).toISOString(),
    });
    return null;
  }
}
async function claimApproved(
  context: ExecutionContext,
  dryRun: boolean,
): Promise<boolean> {
  const { d, action } = context;
  if (Date.parse(action.next_attempt_at) > d.now()) return false;
  const review = await reviewAction(context, dryRun);
  if (!review) return false;
  const result = guard(review, d.wallet, d.now());
  if (dryRun) {
    console.log(JSON.stringify({ review, guard: result }));
    return false;
  }
  if (
    !result.allowed ||
    action.wallet_address?.toLowerCase() !== d.wallet.toLowerCase()
  ) {
    await context.save({
      status: 'blocked',
      review,
      last_error: result.allowed
        ? 'Wallet changed since decision'
        : result.reason,
    });
    return false;
  }
  try {
    await context.save({
      status: 'submitting',
      review,
      claim_token: randomUUID(),
      wallet_address: d.wallet,
      lease_expires_at: leaseExpiry(d.now()),
    });
    return true;
  } catch (error) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== '23505'
    )
      throw error;
    await context.save({
      status: 'skipped',
      last_error: 'Arm already used or wallet has an unresolved action',
    });
    return false;
  }
}
export async function claim(
  context: ExecutionContext,
  dryRun: boolean,
): Promise<boolean> {
  const { action, d } = context;
  if (action.status === 'approved') return claimApproved(context, dryRun);
  if (dryRun || !['submitting', 'submitted'].includes(action.status))
    return false;
  if (action.lease_expires_at && Date.parse(action.lease_expires_at) > d.now())
    return false;
  await context.save({
    claim_token: randomUUID(),
    lease_expires_at: leaseExpiry(d.now()),
  });
  return true;
}
