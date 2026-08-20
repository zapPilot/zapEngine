import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { extractErrorMessage } from '@zapengine/app-core/lib/errors';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useAccount } from '@/integration/useAccount';
import { useInvestDepositReview } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';

/**
 * Owns the Step 2 confirm flow for the unified deposit route: the review
 * expiry timer, per-group risk-acknowledgement state, gate derivations and the
 * submit handler that re-fetches the review and aborts on any drift before
 * handing the batch to the wallet executor.
 */
export function useInvestRouteSubmit({
  review,
  capability,
  hasPlanForScope,
}: {
  review: ReturnType<typeof useInvestDepositReview>;
  capability: DepositExecutionCapability;
  hasPlanForScope: boolean;
}) {
  const router = useRouter();
  const account = useAccount();
  const { pending, reviewedProgress, submitReviewedBatch } =
    useInvestExecution();
  const [launchRequested, setLaunchRequested] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [reviewNow, setReviewNow] = useState(() => Date.now());

  const reviewGroups = review.reviewGroups;
  const reviewExpiryKey = reviewGroups
    .map((group) => `${group.groupId}:${group.expiresAt}`)
    .join('|');
  const reviewGroupCount = reviewGroups.length;
  useEffect(() => {
    if (reviewGroupCount === 0) return;
    const timer = setInterval(() => setReviewNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [reviewExpiryKey, reviewGroupCount]);

  const reviewBlocked = reviewGroups.some(
    (group) =>
      group.blocked || !group.executionAllowed || group.expiresAt <= reviewNow,
  );
  const reviewNotReadyForSend =
    capability === 'ready' &&
    (review.isLoading ||
      review.isError ||
      !review.reviewHasAllGroups ||
      reviewBlocked);
  const reviewExecutionLocked = reviewedProgress !== null;

  const dismissSubmissionError = () => {
    setSubmissionError(null);
    setLaunchRequested(false);
  };

  const handleConfirm = async () => {
    if (reviewExecutionLocked) {
      router.replace('/invest/progress');
      return;
    }
    if (capability === 'connect-wallet') {
      void account.connect();
      return;
    }
    if (
      capability !== 'ready' ||
      !hasPlanForScope ||
      reviewNotReadyForSend ||
      launchRequested
    ) {
      return;
    }
    setLaunchRequested(true);
    setSubmissionError(null);
    try {
      // Submit the exact response the user reviewed. Re-fetching here rebuilds
      // live-price / live-quote plans and can change token amounts or calldata
      // even though the user changed nothing. The review already binds this
      // exact batch with an expiry plus wallet, batch, simulation and risk
      // hashes; the wallet executor re-checks those guards before signing.
      const displayed = review.review;
      const firstReview =
        reviewGroups.find((group) => group.groupId === 'base-morpho') ??
        reviewGroups[0];
      const displayedGroupsSafe =
        Boolean(displayed && firstReview && review.reviewHasAllGroups) &&
        reviewGroups.every(
          (group) =>
            !group.blocked &&
            group.executionAllowed &&
            group.expiresAt > Date.now(),
        );
      if (!displayed || !firstReview || !displayedGroupsSafe) {
        setSubmissionError(
          'The reviewed batch is no longer ready to submit. Refresh the Tenderly review and confirm again.',
        );
        return;
      }
      const result = await submitReviewedBatch({
        plan: displayed.plan,
        review: firstReview,
        queue: reviewGroups.map((group) => ({
          plan: displayed.plan,
          review: group,
        })),
        ...(firstReview.requiresRiskAcknowledgement
          ? { acknowledgedRiskHash: firstReview.expectedRiskHash }
          : {}),
      });
      if (result.status === 'submitted') {
        router.replace('/invest/progress');
        return;
      }
      setSubmissionError(result.reason);
      if (result.status === 'review-changed') void review.refresh();
    } catch (error: unknown) {
      setSubmissionError(extractErrorMessage(error));
    } finally {
      setLaunchRequested(false);
    }
  };

  const ctaLabel = reviewExecutionLocked
    ? 'Return to progress'
    : capability === 'connect-wallet'
      ? account.isConnecting
        ? CONNECTING_LABEL
        : CONNECT_WALLET_CTA
      : pending || launchRequested
        ? 'Confirm in wallet…'
        : 'Confirm & send';
  const ctaDisabled = reviewExecutionLocked
    ? false
    : capability === 'connect-wallet'
      ? account.isConnecting
      : account.isConnecting ||
        pending ||
        launchRequested ||
        review.amountUsd <= 0 ||
        !hasPlanForScope ||
        reviewNotReadyForSend ||
        capability === 'unsupported-wallet';

  return {
    handleConfirm,
    ctaLabel,
    ctaDisabled,
    pending,
    launchRequested,
    reviewNow,
    reviewBlocked,
    reviewNotReadyForSend,
    reviewExecutionLocked,
    submissionError,
    dismissSubmissionError,
  };
}
