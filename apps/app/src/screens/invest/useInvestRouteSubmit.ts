import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHyperCoreSpendableUsdc } from '@zapengine/app-core/services/hyperliquidService';
import type { DepositPlan } from '@zapengine/types/api';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { Address } from 'viem';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';
import { useNowTicker } from '@/hooks/useNowTicker';
import { startHlpSubmission } from '@/integration/hlpSubmissionModel';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import {
  reviewExpiryKey,
  reviewGroupBlocked,
  riskAcknowledgement,
} from '@/integration/investReviewModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import type {
  ReviewedBatch,
  UseInvestReviewResult,
} from '@/integration/useInvestReview';

import type { HyperCoreLegPlan } from './useHyperCoreLegPlan';

function hlpPlanFor(batch: ReviewedBatch): DepositPlan | null {
  if (isStrategyDepositPlan(batch.plan)) return null;
  return hlpStepFromPlan(batch.plan) ? batch.plan : null;
}

/**
 * Owns the Step 2 confirm flow: the review expiry ticker, the gate
 * derivations, and the submit handler that hands the first reviewed batch to
 * the wallet along with the rest of the queue. The reviewed batches are an
 * immutable snapshot — nothing is re-planned here.
 */
export function useInvestRouteSubmit({
  review,
  capability,
  hyperCoreLeg,
}: {
  review: UseInvestReviewResult;
  capability: DepositExecutionCapability;
  /** The HyperCore-funded HLP leg, when this plan has one. */
  hyperCoreLeg: HyperCoreLegPlan | null;
}) {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const { reviewedProgress, submitReviewedBatch } = useInvestExecution();
  const [launchRequested, setLaunchRequested] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const groups = review.batches.map((batch) => batch.review);
  const reviewNow = useNowTicker(groups.length > 0, reviewExpiryKey(groups));
  const reviewBlocked = groups.some((group) =>
    reviewGroupBlocked(group, reviewNow),
  );
  // The leg is not a reviewed batch, but it is signed in the same run: sending
  // before its plan exists, or after the live balance stopped covering it,
  // would strand the user mid-flow on the progress screen.
  const legNotReadyForSend =
    capability === 'ready' && hyperCoreLeg !== null && !hyperCoreLeg.isReady;
  const reviewNotReadyForSend =
    capability === 'ready' &&
    (review.isLoading ||
      review.isError ||
      !review.hasAllBatches ||
      review.batches.length === 0 ||
      reviewBlocked ||
      legNotReadyForSend);
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
      requestAccountConnection(account);
      return;
    }
    if (capability !== 'ready' || reviewNotReadyForSend || launchRequested) {
      return;
    }
    const first = review.batches[0];
    const userAddress = account.address as Address | null;
    if (!first || !userAddress) {
      setSubmissionError(
        'The reviewed batch is no longer ready to submit. Refresh the review and confirm again.',
      );
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
      const submit = () =>
        submitReviewedBatch({
          plan: first.plan,
          review: first.review,
          queue: review.batches.map((batch) => ({
            plan: batch.plan,
            review: batch.review,
          })),
          ...riskAcknowledgement(first.review),
        });

      const hlpPlan = hlpPlanFor(first);
      const step = hlpPlan ? hlpStepFromPlan(hlpPlan) : null;
      const result = step
        ? await startHlpSubmission(
            { user: userAddress, apiUrl: step.signing.apiUrl },
            {
              readSpendableUsd6: async (input) =>
                (await getHyperCoreSpendableUsdc(input)).spendableUsd6,
              setBaselineUsd6: invest.setHlpBaselineUsd6,
              submitReviewedBatch: submit,
            },
          )
        : await submit();

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
      : launchRequested
        ? 'Confirm in wallet…'
        : 'Confirm & send';
  const ctaDisabled = reviewExecutionLocked
    ? false
    : capability === 'connect-wallet'
      ? account.isConnecting
      : account.isConnecting ||
        launchRequested ||
        invest.amountUsd <= 0 ||
        reviewNotReadyForSend ||
        capability === 'unsupported-wallet';

  return {
    handleConfirm,
    ctaLabel,
    ctaDisabled,
    launchRequested,
    reviewNow,
    reviewBlocked,
    reviewNotReadyForSend,
    legNotReadyForSend,
    reviewExecutionLocked,
    submissionError,
    dismissSubmissionError,
  };
}
