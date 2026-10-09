export type FundStep = 'amount' | 'review' | 'progress';
export type FundProgressPhase =
  | 'confirming'
  | 'submitted'
  | 'checkpoint'
  | 'complete'
  | 'failed';
export interface SignRequest {
  kind: 'checkpoint' | 'review' | 'agent';
  amountUsd: number;
  expiresAt: number | null;
}
export function deriveFundStep({
  hasFrozenDraft,
  hasProgress,
}: {
  hasFrozenDraft: boolean;
  hasProgress: boolean;
}): FundStep {
  return hasProgress ? 'progress' : hasFrozenDraft ? 'review' : 'amount';
}
export function deriveFundSignRequest({
  visible,
  hasFrozenDraft,
  amountUsd,
  phase,
  expiresAt,
  needsAgent,
}: {
  visible: boolean;
  hasFrozenDraft: boolean;
  amountUsd: number;
  phase: FundProgressPhase | null;
  expiresAt: number | null;
  needsAgent: boolean;
}): SignRequest | null {
  if (
    visible ||
    !Number.isFinite(amountUsd) ||
    amountUsd <= 0 ||
    phase === 'confirming' ||
    phase === 'submitted' ||
    phase === 'failed'
  )
    return null;
  const base = { amountUsd, expiresAt };
  if (phase === 'checkpoint') return { ...base, kind: 'checkpoint' };
  if (needsAgent) return { ...base, kind: 'agent' };
  if (phase !== null || !hasFrozenDraft) return null;
  return { ...base, kind: 'review' };
}

/** Expiry alone is not evidence that the complete draft passed its checks. */
export function fundReviewExpiry(
  reviews: readonly {
    expiresAt: number;
    blocked: boolean;
    executionAllowed: boolean;
    status: string;
  }[],
  expectedCount: number,
): number | null {
  if (
    expectedCount === 0 ||
    reviews.length !== expectedCount ||
    reviews.some(
      (review) =>
        review.blocked ||
        !review.executionAllowed ||
        review.status === 'failed' ||
        review.status === 'unavailable' ||
        !Number.isFinite(review.expiresAt),
    )
  )
    return null;
  return Math.min(...reviews.map((review) => review.expiresAt));
}
