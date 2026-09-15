import {
  canTrackExisting,
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  shouldOfferAgentEnable,
  unsafeResumeReason,
  type HlpProgressInput,
  type HlpRetryMode,
  type HlpRowState,
} from '@/integration/hlpProgressModel';
import { describe, expect, it } from 'vitest';

function input(overrides: Partial<HlpProgressInput> = {}): HlpProgressInput {
  return {
    fundingSource: 'bridge',
    hyperCoreRequestedUsd6: null,
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
    agentReady: true,
    ...overrides,
  };
}

/** Row states in timeline order: bridge, arrival, vault. */
function rowStates(overrides: Partial<HlpProgressInput>): HlpRowState[] {
  return hlpProgressRows(input(overrides)).map((row) => row.state);
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

const ARRIVED = {
  bridgeConfirmed: true,
  wizardStage: 'hyperliquidDeposit',
  hlpStatus: 'arrived',
} as const satisfies Partial<HlpProgressInput>;

describe('hlpProgressRows', () => {
  it('tracks the bridge while it runs', () => {
    expect(rowStates({})).toEqual(['active', 'active', 'waiting']);
  });

  it('leaves every HLP row untouched when the source batch failed', () => {
    expect(
      rowStates({
        reviewedPhase: 'failed',
        wizardStage: 'sourceExecution',
        hlpStatus: 'idle',
      }),
    ).toEqual(['waiting', 'waiting', 'waiting']);
  });

  it('completes the bridge row from the leg status, not the stage', () => {
    expect(rowStates(ARRIVED)).toEqual(['done', 'done', 'waiting']);
  });

  it('fails the bridge row on a bridging-stage error', () => {
    expect(
      rowStates({ wizardErrorStage: 'bridging', hlpStatus: 'idle' }),
    ).toEqual(['failed', 'waiting', 'waiting']);
  });

  it('activates the vault row while the vaultTransfer confirms', () => {
    expect(rowStates({ ...ARRIVED, hlpStatus: 'confirming' })).toEqual([
      'done',
      'done',
      'active',
    ]);
  });

  it('marks a confirmed deposit done on both HLP rows', () => {
    expect(
      rowStates({ ...ARRIVED, wizardStage: 'done', hlpStatus: 'deposited' }),
    ).toEqual(['done', 'done', 'done']);
  });

  it('never fails an unverified vault row on a deposit-stage error', () => {
    // The exchange accepted the transfer; showing it as failed would invite a
    // second deposit and double a position that locks for four days.
    expect(
      rowStates({
        ...ARRIVED,
        wizardStage: 'done',
        hlpStatus: 'submittedUnverified',
      }),
    ).toEqual(['done', 'done', 'done']);
    expect(
      rowStates({
        ...ARRIVED,
        wizardStage: 'done',
        hlpStatus: 'submittedUnverified',
        wizardErrorStage: 'hyperliquidDeposit',
      }),
    ).toEqual(['done', 'done', 'done']);
  });

  it('separates a failed vault action from failed arrival polling', () => {
    expect(
      rowStates({ ...ARRIVED, wizardErrorStage: 'hyperliquidDeposit' }),
    ).toEqual(['done', 'done', 'failed']);
    expect(
      rowStates({
        bridgeConfirmed: true,
        wizardStage: 'hyperliquidDeposit',
        wizardErrorStage: 'hyperliquidDeposit',
      }),
    ).toEqual(['done', 'failed', 'waiting']);
  });
});

describe('canTrackExisting', () => {
  it('accepts a submitted reviewed plan with a hash and a snapshot', () => {
    expect(canTrackExisting(input())).toBe(true);
  });

  it('refuses every input that makes the existing run unidentifiable', () => {
    expect(canTrackExisting(input({ hasExactPlan: false }))).toBe(false);
    expect(canTrackExisting(input({ hasHlpStep: false }))).toBe(false);
    expect(canTrackExisting(input({ sourceTxHash: null }))).toBe(false);
    expect(canTrackExisting(input({ baselineUsd6: null }))).toBe(false);
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

  it('offers the vault retry only from arrived', () => {
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
    // From `confirming` onwards the accepted transfer already consumed the
    // balance, so a re-poll would report a successful deposit as a failure.
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

describe('agent-gated HLP execution', () => {
  it('runs once the funds arrived on a clean trackable run', () => {
    expectAutoRun(ARRIVED, false, true);
  });

  it('never runs twice for the same arrival', () => {
    expectAutoRun(ARRIVED, true, false);
  });

  it('waits for the arrival before running', () => {
    expectAutoRun({}, false, false);
  });

  it('never runs without an approved device-local agent', () => {
    expectAutoRun({ ...ARRIVED, agentReady: false }, false, false);
  });

  it('never runs while an error is on screen', () => {
    expectAutoRun(
      { ...ARRIVED, wizardErrorStage: 'hyperliquidDeposit' },
      false,
      false,
    );
    expectAutoRun({ ...ARRIVED, flowError: 'boom' }, false, false);
  });

  it('never runs once the reviewed submission was cleared', () => {
    expectAutoRun(
      {
        ...ARRIVED,
        hasReviewedSubmission: false,
        hasExactPlan: false,
        sourceTxHash: null,
      },
      false,
      false,
    );
  });

  it('offers signing enablement exactly when the deposit cannot auto-run', () => {
    expect(
      shouldOfferAgentEnable(input({ ...ARRIVED, agentReady: false })),
    ).toBe(true);
    // Never both at once: the CTA and the automatic run are alternatives.
    expect(shouldOfferAgentEnable(input(ARRIVED))).toBe(false);
    expect(
      shouldOfferAgentEnable(
        input({ ...ARRIVED, agentReady: false, flowError: 'boom' }),
      ),
    ).toBe(false);
    expect(
      shouldOfferAgentEnable(
        input({
          ...ARRIVED,
          agentReady: false,
          wizardErrorStage: 'hyperliquidDeposit',
        }),
      ),
    ).toBe(false);
    expect(
      shouldOfferAgentEnable(
        input({ ...ARRIVED, agentReady: false, baselineUsd6: null }),
      ),
    ).toBe(false);
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

describe('a HyperCore-funded HLP leg', () => {
  const spot = (overrides: Partial<HlpProgressInput> = {}): HlpProgressInput =>
    input({
      fundingSource: 'hypercore',
      hyperCoreRequestedUsd6: '24000000',
      // A spot deposit has none of the bridge evidence, by construction.
      sourceTxHash: null,
      baselineUsd6: null,
      bridgeConfirmed: false,
      wizardStage: 'hyperliquidDeposit',
      hlpStatus: 'arrived',
      ...overrides,
    });

  it('is trackable from its own plan, with no hash or snapshot to wait for', () => {
    expect(canTrackExisting(spot())).toBe(true);
    expect(canTrackExisting(spot({ hyperCoreRequestedUsd6: null }))).toBe(
      false,
    );
    expect(canTrackExisting(spot({ hasHlpStep: false }))).toBe(false);
  });

  it('offers the agent-enable button instead of stalling silently', () => {
    expect(shouldOfferAgentEnable(spot({ agentReady: false }))).toBe(true);
    expect(shouldAutoRunHlpDeposit(spot(), false)).toBe(true);
  });

  it('reports no bridge evidence as missing, because none is expected', () => {
    expect(unsafeResumeReason(spot())).toBeNull();
    expect(
      unsafeResumeReason(spot({ hasReviewedSubmission: false })),
    ).toBeNull();
  });

  it('renders one vault row rather than a bridge that never arrives', () => {
    expect(hlpProgressRows(spot())).toEqual([
      { key: 'vault', state: 'waiting' },
    ]);
    expect(hlpProgressRows(spot({ hlpStatus: 'deposited' }))).toEqual([
      { key: 'vault', state: 'done' },
    ]);
  });

  it('keys its resume on the frozen amount and never offers bridge tracking', () => {
    expect(resumeKey(spot(), 'calls-1')).toBe('hypercore:24000000');
    expect(hlpRetryMode(spot({ hlpStatus: 'idle', flowError: 'boom' }))).toBe(
      'none',
    );
    expect(hlpRetryMode(spot({ wizardErrorStage: 'hyperliquidDeposit' }))).toBe(
      'hlp-signature',
    );
  });
});
