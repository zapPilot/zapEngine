import type {
  WizardHlpStatus,
  WizardStage,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';

import type { ReviewedBatchProgress } from '@/integration/useInvestExecution';

export type HlpRowState = 'waiting' | 'active' | 'done' | 'failed';

export type HlpRetryMode = 'hlp-signature' | 'tracking' | 'none';

/**
 * Everything the HLP progress screen decides from, flattened to primitives so
 * the screen can memoise one stable object and the decisions stay testable
 * without a wallet, a wizard or a plan payload.
 */
export interface HlpProgressInput {
  hasReviewedSubmission: boolean;
  reviewedPhase: ReviewedBatchProgress['phase'] | null;
  reviewedStatusNote: string | null;
  sourceTxHash: string | null;
  baselineUsd6: string | null;
  hasExactPlan: boolean;
  hasHlpStep: boolean;
  wizardStage: WizardStage;
  wizardErrorStage: WizardStage | null;
  hlpStatus: WizardHlpStatus;
  bridgeConfirmed: boolean;
  flowError: string | null;
}

/**
 * Tracking only re-polls the already-submitted source transaction against the
 * pre-bridge snapshot; without either of those the screen has nothing safe to
 * do, and a failed batch must not be followed at all.
 */
export function canTrackExisting(input: HlpProgressInput): boolean {
  return (
    input.hasExactPlan &&
    input.hasHlpStep &&
    Boolean(input.sourceTxHash) &&
    Boolean(input.baselineUsd6) &&
    input.reviewedPhase !== 'failed'
  );
}

export function hlpProgressRows(input: HlpProgressInput): {
  source: HlpRowState;
  bridge: HlpRowState;
  arrival: HlpRowState;
  vault: HlpRowState;
} {
  const source: HlpRowState =
    input.reviewedPhase === 'failed'
      ? 'failed'
      : input.sourceTxHash
        ? 'done'
        : 'active';
  const bridge: HlpRowState = input.bridgeConfirmed
    ? 'done'
    : input.wizardErrorStage === 'bridging'
      ? 'failed'
      : input.wizardStage === 'bridging'
        ? 'active'
        : 'waiting';
  const arrival: HlpRowState =
    input.hlpStatus === 'arrived' ||
    input.hlpStatus === 'confirming' ||
    input.hlpStatus === 'submittedUnverified' ||
    input.hlpStatus === 'deposited'
      ? 'done'
      : input.wizardErrorStage === 'hyperliquidDeposit'
        ? 'failed'
        : input.hlpStatus === 'awaitingArrival'
          ? 'active'
          : 'waiting';
  const vault: HlpRowState =
    input.hlpStatus === 'deposited' || input.hlpStatus === 'submittedUnverified'
      ? 'done'
      : input.hlpStatus === 'confirming'
        ? 'active'
        : input.wizardErrorStage === 'hyperliquidDeposit' &&
            input.hlpStatus === 'arrived'
          ? 'failed'
          : 'waiting';
  return { source, bridge, arrival, vault };
}

/** The fail-closed explanation shown instead of any HLP action. */
export function unsafeResumeReason(input: HlpProgressInput): string | null {
  if (!input.hasReviewedSubmission) {
    return 'No reviewed source submission was found. No HLP action will be attempted.';
  }
  if (!input.baselineUsd6) {
    return 'The pre-bridge Hyperliquid balance snapshot is missing. For safety, Zap Pilot will not infer the deposit amount from the current balance or submit another bridge.';
  }
  if (!input.hasExactPlan || !input.hasHlpStep) {
    return 'The submitted reviewed plan does not contain the expected HLP follow-up. The source transaction will not be resubmitted.';
  }
  // A failed batch is reported before the missing-hash case so the user sees
  // the real cause rather than the hash symptom it produced.
  if (input.reviewedPhase === 'failed') {
    return (
      input.reviewedStatusNote ??
      'The reviewed Base batch reported a failure. Zap Pilot will not resubmit it automatically.'
    );
  }
  if (!input.sourceTxHash) {
    // External wallets expose only the batch id at submit time; the source
    // transaction hash appears once the batch confirms. During confirmation a
    // missing hash is therefore a pending state, not an unsafe one.
    return input.reviewedPhase === 'confirming'
      ? null
      : 'The wallet did not expose the source transaction hash, so Zap Pilot cannot safely track this bridge. The source transaction will not be resubmitted.';
  }
  return null;
}

export function hlpRetryMode(input: HlpProgressInput): HlpRetryMode {
  if (
    input.wizardErrorStage === 'hyperliquidDeposit' &&
    input.hlpStatus === 'arrived'
  ) {
    return 'hlp-signature';
  }
  const hasError = input.wizardErrorStage !== null || input.flowError !== null;
  // Re-polling arrival measures the withdrawable HyperCore balance against the
  // pre-bridge snapshot, so it is only meaningful before a vaultTransfer is
  // accepted: from `confirming` onwards the accepted transfer already consumed
  // that balance and the re-poll would report a successful deposit as a
  // permanent failure. From `arrived` it is satisfied instantly and rethrows
  // the same amount error (a below-minimum arrival) forever.
  const arrivalStillPollable =
    input.hlpStatus === 'idle' || input.hlpStatus === 'awaitingArrival';
  return hasError && arrivalStillPollable && canTrackExisting(input)
    ? 'tracking'
    : 'none';
}

export function shouldAutoRunHlpDeposit(
  input: HlpProgressInput,
  attempted: boolean,
): boolean {
  return (
    input.hlpStatus === 'arrived' &&
    input.wizardErrorStage === null &&
    input.flowError === null &&
    // A cleared reviewed submission (the connected wallet changed, say) means
    // the screen already promises that no HLP action will be attempted.
    canTrackExisting(input) &&
    !attempted
  );
}

/** Identity of one trackable run; a stable value must not restart tracking. */
export function resumeKey(
  input: HlpProgressInput,
  callsId: string | null,
): string | null {
  if (!canTrackExisting(input)) return null;
  return `${callsId ?? 'reviewed'}:${input.sourceTxHash}:${input.baselineUsd6}`;
}
