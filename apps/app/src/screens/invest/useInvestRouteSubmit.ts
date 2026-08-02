import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
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
  const [acknowledgedRiskHashes, setAcknowledgedRiskHashes] = useState<
    Record<string, string>
  >({});

  const reviewGroups = review.reviewGroups;
  const reviewGroupKeys = review.reviewGroupKeys;
  const reviewExpiryKey = reviewGroups
    .map((group) => `${group.groupId}:${group.expiresAt}`)
    .join('|');
  const reviewGroupCount = reviewGroups.length;
  useEffect(() => {
    if (reviewGroupCount === 0) return;
    const timer = setInterval(() => setReviewNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [reviewExpiryKey, reviewGroupCount]);

  const firstReviewForGate =
    reviewGroups.find((group) => group.groupId === 'base-morpho') ??
    reviewGroups[0];
  const reviewBlocked =
    reviewGroups.some(
      (group) =>
        group.blocked ||
        !group.executionAllowed ||
        group.expiresAt <= reviewNow,
    ) ||
    Boolean(
      firstReviewForGate?.requiresRiskAcknowledgement &&
      acknowledgedRiskHashes[firstReviewForGate.groupId] !==
        firstReviewForGate.expectedRiskHash,
    );
  const reviewNotReadyForSend =
    capability === 'ready' &&
    (review.isLoading ||
      review.isError ||
      !review.reviewHasAllGroups ||
      reviewBlocked);
  const reviewExecutionLocked = reviewedProgress !== null;

  const toggleAcknowledgment = (
    groupId: string,
    expectedRiskHash: string,
    acknowledged: boolean,
  ) => {
    setAcknowledgedRiskHashes((current) => {
      const next = { ...current };
      if (acknowledged) {
        next[groupId] = expectedRiskHash;
      } else {
        delete next[groupId];
      }
      return next;
    });
  };

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
      const displayed = review.review;
      const fresh = await review.refresh();
      const displayedGroups = displayed?.reviews ?? {};
      const freshGroups = reviewGroupKeys
        .map((key) => fresh?.reviews[key])
        .filter((group): group is NonNullable<typeof group> => Boolean(group));
      const firstReview =
        freshGroups.find((group) => group.groupId === 'base-morpho') ??
        freshGroups[0];
      const displayedFirst = firstReview
        ? displayedGroups[firstReview.groupId]
        : undefined;
      const freshGroupsSafe =
        freshGroups.length === reviewGroupKeys.length &&
        freshGroups.every(
          (group) =>
            !group.blocked &&
            group.executionAllowed &&
            group.expiresAt > Date.now() &&
            (group.groupId !== firstReview?.groupId ||
              !group.requiresRiskAcknowledgement ||
              acknowledgedRiskHashes[group.groupId] === group.expectedRiskHash),
        );
      const anyGroupDrift = reviewGroupKeys.some((key) => {
        const before = displayedGroups[key];
        const after = fresh?.reviews[key];
        return (
          !before ||
          !after ||
          before.groupFingerprint !== after.groupFingerprint ||
          before.batchFingerprint !== after.batchFingerprint ||
          before.expectedSimulationFingerprint !==
            after.expectedSimulationFingerprint ||
          before.expectedRiskHash !== after.expectedRiskHash
        );
      });
      const drifted =
        !fresh ||
        !review.plan ||
        !firstReview ||
        !displayed ||
        fresh.planFingerprint !== displayed.planFingerprint ||
        !displayedFirst ||
        displayedFirst.groupFingerprint !== firstReview.groupFingerprint ||
        displayedFirst.expectedSimulationFingerprint !==
          firstReview.expectedSimulationFingerprint ||
        displayedFirst.expectedRiskHash !== firstReview.expectedRiskHash ||
        displayedFirst.batchFingerprint !== firstReview.batchFingerprint ||
        anyGroupDrift ||
        !freshGroupsSafe;
      if (drifted) {
        setSubmissionError(
          'The review changed while you were deciding. Review the updated Tenderly evidence and confirm again.',
        );
        if (
          firstReview &&
          displayedFirst?.expectedRiskHash !== firstReview.expectedRiskHash
        ) {
          setAcknowledgedRiskHashes((current) => {
            const next = { ...current };
            delete next[firstReview.groupId];
            return next;
          });
        }
        return;
      }
      const result = await submitReviewedBatch({
        plan: fresh.plan,
        review: firstReview,
        queue: freshGroups.map((group) => ({
          plan: fresh.plan,
          review: group,
        })),
        ...(firstReview.requiresRiskAcknowledgement &&
        acknowledgedRiskHashes[firstReview.groupId] ===
          firstReview.expectedRiskHash
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
      setSubmissionError(
        error instanceof Error ? error.message : String(error),
      );
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
        capability === 'unsupported-wallet' ||
        capability === 'unsupported-path';

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
    acknowledgedRiskHashes,
    toggleAcknowledgment,
    submissionError,
    dismissSubmissionError,
  };
}
