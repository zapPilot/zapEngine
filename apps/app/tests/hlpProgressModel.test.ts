import {
  canTrackExisting,
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  shouldOfferAgentEnable,
  unsafeResumeReason,
  type HlpProgressInput,
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
    agentReady: true,
    ...overrides,
  };
}

describe('hlpProgressRows', () => {
  it('tracks source, bridge, arrival and vault independently', () => {
    expect(hlpProgressRows(input())).toEqual({
      source: 'done',
      bridge: 'active',
      arrival: 'active',
      vault: 'waiting',
    });
    expect(
      hlpProgressRows(
        input({
          bridgeConfirmed: true,
          wizardStage: 'hyperliquidDeposit',
          hlpStatus: 'confirming',
        }),
      ),
    ).toEqual({
      source: 'done',
      bridge: 'done',
      arrival: 'done',
      vault: 'active',
    });
  });

  it('treats submitted-unverified as terminal, never as a retryable failure', () => {
    expect(
      hlpProgressRows(
        input({
          bridgeConfirmed: true,
          wizardStage: 'done',
          hlpStatus: 'submittedUnverified',
          wizardErrorStage: 'hyperliquidDeposit',
        }),
      ),
    ).toEqual({
      source: 'done',
      bridge: 'done',
      arrival: 'done',
      vault: 'done',
    });
  });
});

describe('tracking safety', () => {
  it('requires exact plan, HLP step, source hash, baseline, and nonfailed review', () => {
    expect(canTrackExisting(input())).toBe(true);
    expect(canTrackExisting(input({ hasExactPlan: false }))).toBe(false);
    expect(canTrackExisting(input({ hasHlpStep: false }))).toBe(false);
    expect(canTrackExisting(input({ sourceTxHash: null }))).toBe(false);
    expect(canTrackExisting(input({ baselineUsd6: null }))).toBe(false);
    expect(canTrackExisting(input({ reviewedPhase: 'failed' }))).toBe(false);
  });

  it('reports unsafe resume states without suggesting a source resubmission', () => {
    expect(unsafeResumeReason(input())).toBeNull();
    expect(
      unsafeResumeReason(input({ hasReviewedSubmission: false })),
    ).toContain('No reviewed source submission');
    expect(unsafeResumeReason(input({ baselineUsd6: null }))).toContain(
      'pre-bridge Hyperliquid balance snapshot is missing',
    );
    expect(unsafeResumeReason(input({ hasHlpStep: false }))).toContain(
      'does not contain the expected HLP follow-up',
    );
    expect(
      unsafeResumeReason(input({ sourceTxHash: null, reviewedPhase: 'submitted' })),
    ).toContain('will not be resubmitted');
  });

  it('keeps a missing hash nonfatal while the reviewed batch is confirming', () => {
    expect(
      unsafeResumeReason(
        input({ sourceTxHash: null, reviewedPhase: 'confirming' }),
      ),
    ).toBeNull();
  });
});

describe('agent-gated HLP execution', () => {
  const arrived = {
    bridgeConfirmed: true,
    wizardStage: 'hyperliquidDeposit' as const,
    hlpStatus: 'arrived' as const,
  };

  it('auto-runs only when the local agent is ready', () => {
    expect(shouldAutoRunHlpDeposit(input(arrived), false)).toBe(true);
    expect(
      shouldAutoRunHlpDeposit(input({ ...arrived, agentReady: false }), false),
    ).toBe(false);
    expect(shouldAutoRunHlpDeposit(input(arrived), true)).toBe(false);
  });

  it('offers one-time signing enablement instead of a vault signature', () => {
    expect(
      shouldOfferAgentEnable(input({ ...arrived, agentReady: false })),
    ).toBe(true);
    expect(shouldOfferAgentEnable(input(arrived))).toBe(false);
    expect(
      shouldOfferAgentEnable(
        input({ ...arrived, agentReady: false, flowError: 'boom' }),
      ),
    ).toBe(false);
  });

  it('never auto-runs when an error is visible or tracking is unsafe', () => {
    expect(
      shouldAutoRunHlpDeposit(
        input({ ...arrived, wizardErrorStage: 'hyperliquidDeposit' }),
        false,
      ),
    ).toBe(false);
    expect(
      shouldAutoRunHlpDeposit(
        input({ ...arrived, hasReviewedSubmission: false }),
        false,
      ),
    ).toBe(false);
  });
});

describe('retry and resume identity', () => {
  it('only retries a definitely failed vault signature from arrived', () => {
    expect(
      hlpRetryMode(
        input({
          hlpStatus: 'arrived',
          wizardErrorStage: 'hyperliquidDeposit',
        }),
      ),
    ).toBe('hlp-signature');
    expect(
      hlpRetryMode(
        input({
          hlpStatus: 'submittedUnverified',
          flowError: 'confirmation timeout',
        }),
      ),
    ).toBe('none');
  });

  it('uses stable existing-submission identity', () => {
    expect(resumeKey(input(), 'c1')).toBe('c1:0xsource:1000000');
    expect(resumeKey(input(), null)).toBe('reviewed:0xsource:1000000');
    expect(resumeKey(input({ baselineUsd6: null }), 'c1')).toBeNull();
  });
});
