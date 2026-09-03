import {
  canTrackExisting,
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  unsafeResumeReason,
  type HlpProgressInput,
  type HlpRetryMode,
  type HlpRowState,
} from '@/integration/hlpProgressModel';
import { describe, expect, it } from 'vitest';

function input(overrides: Partial<HlpProgressInput> = {}): HlpProgressInput {
  return {
    hasReviewedSubmission: true,
    reviewedPhase: 'submitted',
    reviewedStatusNote: null,
    sourceTxHash: '0xsource',
    baselineUsd6: '1000000',
    hasExactPlan: true,
    hasHlpStep: true,
    wizardStage: 'bridging',
    wizardErrorStage: null,
    hlpStatus: 'awaitingArrival',
    bridgeConfirmed: false,
    flowError: null,
    ...overrides,
  };
}

/** Row states in timeline order: source, bridge, arrival, vault. */
function rowStates(overrides: Partial<HlpProgressInput>): HlpRowState[] {
  const rows = hlpProgressRows(input(overrides));
  return [rows.source, rows.bridge, rows.arrival, rows.vault];
}

function expectReason(
  overrides: Partial<HlpProgressInput>,
  expected: string | null,
): void {
  expect(unsafeResumeReason(input(overrides))).toBe(expected);
}

function expectRetryMode(
  overrides: Partial<HlpProgressInput>,
  expected: HlpRetryMode,
): void {
  expect(hlpRetryMode(input(overrides))).toBe(expected);
}

function expectAutoRun(
  overrides: Partial<HlpProgressInput>,
  attempted: boolean,
  expected: boolean,
): void {
  expect(shouldAutoRunHlpDeposit(input(overrides), attempted)).toBe(expected);
}

const NO_SUBMISSION =
  'No reviewed source submission was found. No HLP action will be attempted.';
const MISSING_BASELINE =
  'The pre-bridge Hyperliquid balance snapshot is missing. For safety, Zap Pilot will not infer the deposit amount from the current balance or submit another bridge.';
const MISSING_FOLLOW_UP =
  'The submitted reviewed plan does not contain the expected HLP follow-up. The source transaction will not be resubmitted.';
const BATCH_FAILED =
  'The reviewed Base batch reported a failure. Zap Pilot will not resubmit it automatically.';
const MISSING_HASH =
  'The wallet did not expose the source transaction hash, so Zap Pilot cannot safely track this bridge. The source transaction will not be resubmitted.';

describe('hlpProgressRows', () => {
  it('tracks the submitted source batch while the bridge runs', () => {
    expect(rowStates({})).toEqual(['done', 'active', 'active', 'waiting']);
  });

  it('keeps the source row active until the wallet exposes a hash', () => {
    const rows = rowStates({
      sourceTxHash: null,
      reviewedPhase: 'confirming',
    });
    expect(rows).toEqual(['active', 'active', 'active', 'waiting']);
  });

  it('fails the source row on a reported batch failure', () => {
    const rows = rowStates({
      reviewedPhase: 'failed',
      wizardStage: 'sourceExecution',
      hlpStatus: 'idle',
    });
    expect(rows).toEqual(['failed', 'waiting', 'waiting', 'waiting']);
  });

  it('completes the bridge row from the leg status, not the stage', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'hyperliquidDeposit',
      hlpStatus: 'arrived',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'waiting']);
  });

  it('fails the bridge row on a bridging-stage error', () => {
    const rows = rowStates({ wizardErrorStage: 'bridging', hlpStatus: 'idle' });
    expect(rows).toEqual(['done', 'failed', 'waiting', 'waiting']);
  });

  it('activates the vault row while the vaultTransfer confirms', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'hyperliquidDeposit',
      hlpStatus: 'confirming',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'active']);
  });

  it('treats an accepted-but-unverified deposit as a finished vault', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'done',
      hlpStatus: 'submittedUnverified',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'done']);
  });

  it('never fails an unverified vault row on a deposit-stage error', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'done',
      hlpStatus: 'submittedUnverified',
      wizardErrorStage: 'hyperliquidDeposit',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'done']);
  });

  it('marks a confirmed deposit done on both HLP rows', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'done',
      hlpStatus: 'deposited',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'done']);
  });

  it('fails only the vault row when the signature failed from arrived', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'hyperliquidDeposit',
      hlpStatus: 'arrived',
      wizardErrorStage: 'hyperliquidDeposit',
    });
    expect(rows).toEqual(['done', 'done', 'done', 'failed']);
  });

  it('fails the arrival row when arrival polling itself failed', () => {
    const rows = rowStates({
      bridgeConfirmed: true,
      wizardStage: 'hyperliquidDeposit',
      wizardErrorStage: 'hyperliquidDeposit',
    });
    expect(rows).toEqual(['done', 'done', 'failed', 'waiting']);
  });
});

describe('canTrackExisting', () => {
  it('accepts a submitted reviewed plan with a hash and a snapshot', () => {
    expect(canTrackExisting(input())).toBe(true);
  });

  it('refuses to track without the exact reviewed plan', () => {
    expect(canTrackExisting(input({ hasExactPlan: false }))).toBe(false);
  });

  it('refuses to track a plan without the HLP follow-up', () => {
    expect(canTrackExisting(input({ hasHlpStep: false }))).toBe(false);
  });

  it('refuses to track without a source transaction hash', () => {
    expect(canTrackExisting(input({ sourceTxHash: null }))).toBe(false);
  });

  it('refuses to infer the amount without the pre-bridge snapshot', () => {
    expect(canTrackExisting(input({ baselineUsd6: null }))).toBe(false);
  });

  it('refuses to follow a batch that reported a failure', () => {
    expect(canTrackExisting(input({ reviewedPhase: 'failed' }))).toBe(false);
  });
});

describe('unsafeResumeReason', () => {
  it('stays silent for a healthy tracked run', () => {
    expectReason({}, null);
  });

  it('reports a missing reviewed submission first', () => {
    expectReason(
      { hasReviewedSubmission: false, baselineUsd6: null },
      NO_SUBMISSION,
    );
  });

  it('reports the missing pre-bridge snapshot', () => {
    expectReason({ baselineUsd6: null }, MISSING_BASELINE);
  });

  it('reports a plan without the expected HLP follow-up', () => {
    expectReason({ hasHlpStep: false }, MISSING_FOLLOW_UP);
    expectReason({ hasExactPlan: false }, MISSING_FOLLOW_UP);
  });

  it('prefers the reported failure note over the generic copy', () => {
    const note = 'Batch 0xabc reverted in the router call.';
    expectReason({ reviewedPhase: 'failed', reviewedStatusNote: note }, note);
    expectReason({ reviewedPhase: 'failed' }, BATCH_FAILED);
  });

  it('reports the real failure instead of the hash it never produced', () => {
    expectReason({ reviewedPhase: 'failed', sourceTxHash: null }, BATCH_FAILED);
  });

  it('reports a missing hash once the batch is no longer confirming', () => {
    expectReason({ sourceTxHash: null }, MISSING_HASH);
  });

  it('treats a missing hash during confirmation as pending, not unsafe', () => {
    expectReason({ sourceTxHash: null, reviewedPhase: 'confirming' }, null);
  });
});

describe('hlpRetryMode', () => {
  it('offers no action without an error', () => {
    expectRetryMode({}, 'none');
  });

  it('offers the signature retry only from arrived', () => {
    expectRetryMode(
      { wizardErrorStage: 'hyperliquidDeposit', hlpStatus: 'arrived' },
      'hlp-signature',
    );
    expectRetryMode(
      { wizardErrorStage: 'hyperliquidDeposit', hlpStatus: 'awaitingArrival' },
      'tracking',
    );
  });

  it('offers tracking only while arrival is still pollable', () => {
    expectRetryMode({ hlpStatus: 'idle', flowError: 'boom' }, 'tracking');
    expectRetryMode({ flowError: 'boom' }, 'tracking');
  });

  it('never re-polls arrival once the vaultTransfer was accepted', () => {
    expectRetryMode({ hlpStatus: 'confirming', flowError: 'boom' }, 'none');
    expectRetryMode(
      { hlpStatus: 'submittedUnverified', flowError: 'boom' },
      'none',
    );
    expectRetryMode({ hlpStatus: 'deposited', flowError: 'boom' }, 'none');
  });

  it('offers no instant re-poll for a below-minimum arrival', () => {
    expectRetryMode({ hlpStatus: 'arrived', flowError: 'below min' }, 'none');
  });

  it('offers no retry when the run is not trackable any more', () => {
    expectRetryMode({ flowError: 'boom', baselineUsd6: null }, 'none');
    expectRetryMode({ flowError: 'boom', hasExactPlan: false }, 'none');
    expectRetryMode({ flowError: 'boom', reviewedPhase: 'failed' }, 'none');
  });
});

describe('shouldAutoRunHlpDeposit', () => {
  it('runs once the funds arrived on a clean trackable run', () => {
    expectAutoRun({ hlpStatus: 'arrived' }, false, true);
  });

  it('never runs twice for the same arrival', () => {
    expectAutoRun({ hlpStatus: 'arrived' }, true, false);
  });

  it('waits for the arrival before running', () => {
    expectAutoRun({}, false, false);
  });

  it('never runs while an error is on screen', () => {
    expectAutoRun(
      { hlpStatus: 'arrived', wizardErrorStage: 'hyperliquidDeposit' },
      false,
      false,
    );
    expectAutoRun({ hlpStatus: 'arrived', flowError: 'boom' }, false, false);
  });

  it('never runs once the reviewed submission was cleared', () => {
    expectAutoRun(
      {
        hlpStatus: 'arrived',
        hasReviewedSubmission: false,
        hasExactPlan: false,
        sourceTxHash: null,
      },
      false,
      false,
    );
  });
});

describe('resumeKey', () => {
  it('has no key when tracking is impossible', () => {
    expect(resumeKey(input({ baselineUsd6: null }), 'c1')).toBeNull();
    expect(resumeKey(input({ sourceTxHash: null }), 'c1')).toBeNull();
    expect(resumeKey(input({ reviewedPhase: 'failed' }), 'c1')).toBeNull();
  });

  it('stays stable for the same submission, hash and snapshot', () => {
    expect(resumeKey(input(), 'c1')).toBe('c1:0xsource:1000000');
    expect(resumeKey(input(), 'c1')).toBe(resumeKey(input(), 'c1'));
  });

  it('changes with the calls id, the hash or the snapshot', () => {
    const base = resumeKey(input(), 'c1');
    expect(resumeKey(input(), 'c2')).not.toBe(base);
    expect(resumeKey(input({ sourceTxHash: '0xother' }), 'c1')).not.toBe(base);
    expect(resumeKey(input({ baselineUsd6: '2000000' }), 'c1')).not.toBe(base);
  });

  it('falls back to a stable key when the wallet exposes no calls id', () => {
    expect(resumeKey(input(), null)).toBe('reviewed:0xsource:1000000');
  });
});
