import type {
  WizardHlpStatus,
  WizardStage,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';

import type { ReviewedBatchProgress } from '@/integration/useInvestExecution';

export type HlpRowState = 'waiting' | 'active' | 'done' | 'failed';
export type HlpRetryMode = 'hlp-signature' | 'tracking' | 'none';
/** Where the HLP allocation's money comes from, which changes every predicate. */
export type HlpFundingSource = 'bridge' | 'hypercore';
export type HlpRowKey = 'bridge' | 'arrival' | 'vault';
export interface HlpProgressRow {
  key: HlpRowKey;
  state: HlpRowState;
}

export interface HlpProgressInput {
  fundingSource: HlpFundingSource;
  hasReviewedSubmission: boolean;
  reviewedPhase: ReviewedBatchProgress['phase'] | null;
  reviewedStatusNote: string | null;
  sourceTxHash: string | null;
  baselineUsd6: string | null;
  /** The frozen HyperCore leg amount; the only identity a spot deposit has. */
  hyperCoreRequestedUsd6: string | null;
  hasExactPlan: boolean;
  hasHlpStep: boolean;
  wizardStage: WizardStage;
  wizardErrorStage: WizardStage | null;
  hlpStatus: WizardHlpStatus;
  bridgeConfirmed: boolean;
  flowError: string | null;
  agentReady: boolean;
}

/**
 * Whether the vault deposit may be driven from what is already known. A bridged
 * deposit needs the source transaction and the pre-bridge balance snapshot it
 * is measured against; a HyperCore deposit has neither and needs neither — its
 * amount is fixed by the plan itself.
 */
export function canTrackExisting(input: HlpProgressInput): boolean {
  if (input.reviewedPhase === 'failed') return false;
  if (input.fundingSource === 'hypercore') {
    return (
      input.hasExactPlan &&
      input.hasHlpStep &&
      Boolean(input.hyperCoreRequestedUsd6)
    );
  }
  return (
    input.hasExactPlan &&
    input.hasHlpStep &&
    Boolean(input.sourceTxHash) &&
    Boolean(input.baselineUsd6)
  );
}

export function hlpProgressRows(input: HlpProgressInput): HlpProgressRow[] {
  const vault: HlpRowState =
    input.hlpStatus === 'deposited' || input.hlpStatus === 'submittedUnverified'
      ? 'done'
      : input.hlpStatus === 'confirming'
        ? 'active'
        : input.wizardErrorStage === 'hyperliquidDeposit' &&
            input.hlpStatus === 'arrived'
          ? 'failed'
          : 'waiting';
  // A HyperCore deposit has no bridge and no arrival to wait for, so rendering
  // those rows would show progress that can never complete.
  if (input.fundingSource === 'hypercore')
    return [{ key: 'vault', state: vault }];
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
  return [
    { key: 'bridge', state: bridge },
    { key: 'arrival', state: arrival },
    { key: 'vault', state: vault },
  ];
}

export function unsafeResumeReason(input: HlpProgressInput): string | null {
  // Every reason below describes a missing piece of *bridge* evidence. A spot
  // deposit has no source transaction to withhold and no snapshot to lose, so
  // reporting any of them here would name a problem that does not exist.
  if (input.fundingSource === 'hypercore') return null;
  if (!input.hasReviewedSubmission) {
    return 'No reviewed source submission was found. No HLP action will be attempted.';
  }
  if (!input.baselineUsd6) {
    return 'The pre-bridge Hyperliquid balance snapshot is missing. For safety, Zap Pilot will not infer the deposit amount from the current balance or submit another bridge.';
  }
  if (!input.hasExactPlan || !input.hasHlpStep) {
    return 'The submitted reviewed plan does not contain the expected HLP follow-up. The source transaction will not be resubmitted.';
  }
  if (input.reviewedPhase === 'failed') {
    return (
      input.reviewedStatusNote ??
      'The reviewed Base batch reported a failure. Zap Pilot will not resubmit it automatically.'
    );
  }
  if (!input.sourceTxHash) {
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
  const arrivalStillPollable =
    input.hlpStatus === 'idle' || input.hlpStatus === 'awaitingArrival';
  return input.fundingSource === 'bridge' &&
    hasError &&
    arrivalStillPollable &&
    canTrackExisting(input)
    ? 'tracking'
    : 'none';
}

export function shouldAutoRunHlpDeposit(
  input: HlpProgressInput,
  attempted: boolean,
): boolean {
  return (
    input.hlpStatus === 'arrived' &&
    input.agentReady &&
    input.wizardErrorStage === null &&
    input.flowError === null &&
    canTrackExisting(input) &&
    !attempted
  );
}

export function shouldOfferAgentEnable(input: HlpProgressInput): boolean {
  return (
    input.hlpStatus === 'arrived' &&
    !input.agentReady &&
    input.wizardErrorStage === null &&
    input.flowError === null &&
    canTrackExisting(input)
  );
}

export function resumeKey(
  input: HlpProgressInput,
  callsId: string | null,
): string | null {
  if (!canTrackExisting(input)) return null;
  return input.fundingSource === 'hypercore'
    ? `hypercore:${input.hyperCoreRequestedUsd6}`
    : `${callsId ?? 'reviewed'}:${input.sourceTxHash}:${input.baselineUsd6}`;
}
