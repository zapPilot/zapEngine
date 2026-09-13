import {
  depositWizardReducer,
  hlpSpendableShortfallUsd6,
  initialDepositWizardState,
  resolveHlpDepositUsd6,
  type DepositWizardEvent,
  type DepositWizardState,
} from '@core/lib/wallet/depositWizardMachine';
import type {
  DepositPlan,
  HlpSpotDepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const signing = {
  scheme: 'hyperliquid-l1-action' as const,
  hyperliquidChain: 'Mainnet' as const,
  apiUrl: 'https://api.hyperliquid.xyz',
};

const hlpStep: HyperliquidVaultDepositStep = {
  kind: 'hyperliquid-vault-deposit',
  chainId: 1337,
  afterLegIndex: 1,
  amount: { source: 'bridge-output', legIndex: 1 },
  expectedUsd: '29000000',
  minDepositUsd: '10000000',
  action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
  signing,
  lockupDays: 4,
};

const plan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC,
      fromAmount: '70000000',
      toAmountMin: '70000000',
      gasUsd: '0.1',
      durationSec: 12,
    },
    {
      chainId: 1337,
      kind: 'bridge',
      protocol: 'hyperliquid',
      toToken: HYPERCORE_USDC,
      fromAmount: '30000000',
      toAmountMin: '29000000',
      bridge: 'relaydepository',
      gasUsd: '0.01',
      durationSec: 2,
    },
  ],
  approvals: [],
  calls: [
    {
      to: BASE_USDC,
      data: '0x11',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SUPPLY' },
    },
    {
      to: BASE_USDC,
      data: '0x22',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'BRIDGE' },
    },
  ],
  followUps: [hlpStep],
  totalGasUsd: '0.11',
  sourceChainId: 8453,
};

const spotPlan: HlpSpotDepositPlan = {
  kind: 'hlp-spot-deposit',
  execution: 'hypercore-signatures',
  amountUsd6: '10000000',
  minDepositUsd: '10000000',
  lockupDays: 4,
  step: {
    kind: 'hyperliquid-vault-deposit',
    chainId: 1337,
    amount: { source: 'fixed', amount: '10000000' },
    minDepositUsd: '10000000',
    action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
    signing,
    lockupDays: 4,
  },
};

function run(
  events: DepositWizardEvent[],
  from: DepositWizardState = initialDepositWizardState,
): DepositWizardState {
  return events.reduce(depositWizardReducer, from);
}

/** Bridged, funds credited on HyperCore, HLP deposit not yet submitted. */
function arrivedState(): DepositWizardState {
  return run([
    { type: 'PLAN_LOADED', plan, baselineUsd6: 1_000_000n },
    { type: 'SOURCE_CONFIRMED', transactionHash: '0xbatch' },
    { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'destinationConfirmed' },
    { type: 'HL_ARRIVED', arrivedUsd6: 29_500_000n },
  ]);
}

function loadSpot(spendableUsd6: bigint): DepositWizardState {
  return run([{ type: 'SPOT_PLAN_LOADED', plan: spotPlan, spendableUsd6 }]);
}

describe('depositWizardReducer', () => {
  it('walks the reviewed bridge and HLP follow-up to done', () => {
    let state = run([{ type: 'PLAN_LOADED', plan, baselineUsd6: 1_000_000n }]);
    expect(state.stage).toBe('sourceExecution');
    expect(state.legs.map((leg) => leg.status)).toEqual(['pending', 'pending']);
    expect(state.hlp.step).toEqual(hlpStep);
    expect(state.hlp.baselineUsd6).toBe(1_000_000n);

    state = run([{ type: 'SOURCE_SUBMITTED' }], state);
    expect(state.legs.every((leg) => leg.status === 'submitted')).toBe(true);

    state = run(
      [{ type: 'SOURCE_CONFIRMED', transactionHash: '0xbatch' }],
      state,
    );
    expect(state.stage).toBe('bridging');
    expect(state.legs[0]?.sourceTxHash).toBe('0xbatch');

    state = run(
      [
        { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'bridgePending' },
        {
          type: 'BRIDGE_UPDATE',
          legIndex: 1,
          status: 'destinationConfirmed',
          destinationTxHash: '0xdest',
        },
      ],
      state,
    );
    expect(state.stage).toBe('hyperliquidDeposit');
    expect(state.hlp.status).toBe('awaitingArrival');
    expect(state.legs[1]?.destinationTxHash).toBe('0xdest');

    state = run(
      [
        { type: 'HL_ARRIVED', arrivedUsd6: 29_500_000n },
        { type: 'HL_SUBMITTED' },
        { type: 'HL_CONFIRMED', vaultEquityUsd6: 29_400_000n },
      ],
      state,
    );
    expect(state.stage).toBe('done');
    expect(state.hlp.status).toBe('deposited');
    expect(state.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(state.hlp.vaultEquityUsd6).toBe(29_400_000n);
  });

  it('goes straight to done when the plan has neither bridges nor an HLP step', () => {
    const baseOnly: DepositPlan = {
      ...plan,
      legs: [plan.legs[0]!],
      calls: [plan.calls[0]!],
    };
    delete (baseOnly as { followUps?: unknown }).followUps;

    const state = run([
      { type: 'PLAN_LOADED', plan: baseOnly },
      { type: 'SOURCE_CONFIRMED' },
    ]);
    expect(state.stage).toBe('done');
  });

  it('skips the HLP stage for bridge-only plans without an HLP follow-up', () => {
    const bridgeOnly: DepositPlan = { ...plan };
    delete (bridgeOnly as { followUps?: unknown }).followUps;

    const state = run([
      { type: 'PLAN_LOADED', plan: bridgeOnly },
      { type: 'SOURCE_CONFIRMED' },
      { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'destinationConfirmed' },
    ]);
    expect(state.stage).toBe('done');
    expect(state.hlp.status).toBe('idle');
  });

  it('surfaces a bridging error when a bridge leg fails terminally', () => {
    const state = run([
      { type: 'PLAN_LOADED', plan },
      { type: 'SOURCE_CONFIRMED' },
      { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'failed' },
    ]);
    expect(state.stage).toBe('bridging');
    expect(state.error?.stage).toBe('bridging');
  });

  it('does not advance while a bridge leg is still pending', () => {
    const state = run([
      { type: 'PLAN_LOADED', plan },
      { type: 'SOURCE_CONFIRMED' },
      { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'bridgePending' },
    ]);
    expect(state.stage).toBe('bridging');
    expect(state.hlp.status).toBe('idle');
  });

  it('arms a sufficient spot plan directly at the vault action', () => {
    const state = loadSpot(10_000_000n);
    expect(state.stage).toBe('hyperliquidDeposit');
    expect(state.hlp.status).toBe('arrived');
    expect(state.hlp.step).toEqual(spotPlan.step);
    // No EVM legs and no source batch: this plan is one exchange action.
    expect(state.legs).toEqual([]);
    expect(state.plan).toBeNull();
    expect(state.error).toBeNull();
  });

  it('fails closed when live spendable USDC is insufficient', () => {
    const state = loadSpot(9_000_000n);
    // `arrived` is the one status the deposit runs from, so a shortfall must
    // not reach it: the machine itself has to refuse, not just the screen.
    expect(state.hlp.status).toBe('idle');
    expect(state.error?.stage).toBe('hyperliquidDeposit');
    expect(state.error?.message).toContain('short by 1000000');

    // And the submission event cannot talk it into starting anyway.
    const submitted = run([{ type: 'HL_SUBMITTED' }], state);
    expect(submitted).toBe(state);
  });

  it('treats an exactly-covered deposit as spendable', () => {
    expect(loadSpot(10_000_000n).hlp.status).toBe('arrived');
    expect(loadSpot(9_999_999n).hlp.status).toBe('idle');
    expect(loadSpot(50_000_000n).hlp.status).toBe('arrived');
  });

  it('hands the vault action back only when submission definitely failed', () => {
    const submitting = run([{ type: 'HL_SUBMITTED' }], arrivedState());
    expect(submitting.hlp.status).toBe('confirming');

    const state = run([{ type: 'HL_SUBMIT_FAILED' }], submitting);
    expect(state.hlp.status).toBe('arrived');
    expect(state.stage).toBe('hyperliquidDeposit');
    // The retry needs both of these to resolve the vaultTransfer amount.
    expect(state.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(state.hlp.step).toEqual(hlpStep);
  });

  it('finishes submitted-unverified after an accepted action cannot be confirmed', () => {
    const state = run(
      [{ type: 'HL_SUBMITTED' }, { type: 'HL_UNVERIFIED' }],
      arrivedState(),
    );
    expect(state.stage).toBe('done');
    expect(state.hlp.status).toBe('submittedUnverified');
    // A confirmation timeout is not a stage failure.
    expect(state.error).toBeNull();
  });

  it('ignores HLP submission outcomes that do not belong to a live submission', () => {
    // A reset mid-submit must not let the superseded run publish anything.
    const afterReset = run(
      [{ type: 'HL_SUBMITTED' }, { type: 'RESET' }],
      arrivedState(),
    );
    for (const event of [
      { type: 'HL_SUBMIT_FAILED' },
      { type: 'HL_UNVERIFIED' },
      { type: 'HL_CONFIRMED', vaultEquityUsd6: 29_400_000n },
    ] satisfies DepositWizardEvent[]) {
      expect(run([event], afterReset)).toEqual(initialDepositWizardState);
    }

    // Same guard from the terminal states themselves.
    const deposited = run(
      [{ type: 'HL_SUBMITTED' }, { type: 'HL_CONFIRMED', vaultEquityUsd6: 1n }],
      arrivedState(),
    );
    expect(run([{ type: 'HL_SUBMIT_FAILED' }], deposited)).toBe(deposited);
    expect(run([{ type: 'HL_UNVERIFIED' }], deposited)).toBe(deposited);
  });

  it('ignores HL_ARRIVED unless an arrival watcher is armed', () => {
    // Nothing downstream clears a foreign delta, so a late resolve from a
    // superseded run must not stamp one onto a fresh machine.
    const afterReset = run([{ type: 'RESET' }], arrivedState());
    expect(
      run([{ type: 'HL_ARRIVED', arrivedUsd6: 42_000_000n }], afterReset),
    ).toEqual(initialDepositWizardState);

    // Nor may it overwrite the measurement of a submission already in flight.
    const confirming = run([{ type: 'HL_SUBMITTED' }], arrivedState());
    expect(
      run([{ type: 'HL_ARRIVED', arrivedUsd6: 42_000_000n }], confirming),
    ).toBe(confirming);
  });

  it('ignores BRIDGE_UPDATE outside the bridging stage', () => {
    // An empty legs array reads as "every bridge terminal", so a settled poll
    // from a superseded run would otherwise flip the wizard to done.
    const afterReset = run([{ type: 'RESET' }], arrivedState());
    expect(
      run(
        [
          {
            type: 'BRIDGE_UPDATE',
            legIndex: 1,
            status: 'destinationConfirmed',
            destinationTxHash: '0xdest',
          },
        ],
        afterReset,
      ),
    ).toEqual(initialDepositWizardState);

    // Same guard once the wizard has already moved past bridging.
    const arrived = arrivedState();
    expect(
      run([{ type: 'BRIDGE_UPDATE', legIndex: 1, status: 'failed' }], arrived),
    ).toBe(arrived);
  });

  it('records and clears stage failures via RETRY', () => {
    let state = run([
      { type: 'PLAN_LOADED', plan },
      { type: 'STAGE_FAILED', stage: 'sourceExecution', message: 'boom' },
    ]);
    expect(state.error).toEqual({ stage: 'sourceExecution', message: 'boom' });

    state = run([{ type: 'RETRY' }], state);
    expect(state.error).toBeNull();
    expect(state.stage).toBe('sourceExecution');
  });

  it('resets out of every terminal and armed state', () => {
    expect(run([{ type: 'PLAN_LOADED', plan }, { type: 'RESET' }])).toEqual(
      initialDepositWizardState,
    );
    expect(
      run(
        [
          { type: 'HL_SUBMITTED' },
          { type: 'HL_UNVERIFIED' },
          { type: 'RESET' },
        ],
        arrivedState(),
      ),
    ).toEqual(initialDepositWizardState);
    expect(run([{ type: 'RESET' }], loadSpot(10_000_000n))).toEqual(
      initialDepositWizardState,
    );
  });
});

describe('hlpSpendableShortfallUsd6', () => {
  it('measures against an absolute target, never a delta', () => {
    expect(hlpSpendableShortfallUsd6(10_000_000n, 0n)).toBe(10_000_000n);
    expect(hlpSpendableShortfallUsd6(10_000_000n, 7_000_000n)).toBe(3_000_000n);
  });

  it('reports no shortfall once the balance covers the deposit', () => {
    expect(hlpSpendableShortfallUsd6(10_000_000n, 10_000_000n)).toBe(0n);
    // Never negative: a surplus must not read as a credit to transfer back.
    expect(hlpSpendableShortfallUsd6(10_000_000n, 20_000_000n)).toBe(0n);
  });
});

describe('resolveHlpDepositUsd6', () => {
  it('uses the fixed amount for direct HLP deposits', () => {
    expect(resolveHlpDepositUsd6(spotPlan.step, null)).toBe(10_000_000n);
    expect(
      resolveHlpDepositUsd6(
        { ...hlpStep, amount: { source: 'fixed', amount: '12000000' } },
        null,
      ),
    ).toBe(12_000_000n);
  });

  it('uses the actually-received amount for bridge-output steps', () => {
    expect(resolveHlpDepositUsd6(hlpStep, 29_500_000n)).toBe(29_500_000n);
  });

  it('caps a bridge-output amount at what the bridge could deliver', () => {
    // An unrelated HyperCore credit landing between the pre-bridge snapshot
    // and the signature must not be swept into the days-long lock.
    expect(resolveHlpDepositUsd6(hlpStep, 41_000_000n)).toBe(29_580_000n);
    // The cap is expressed in the destination's units, so it cannot be
    // confused with a source amount denominated in another token's decimals.
    expect(
      resolveHlpDepositUsd6(
        { ...hlpStep, expectedUsd: '10000000' },
        99n * 10n ** 6n,
      ),
    ).toBe(10_200_000n);
  });

  it('rejects missing bridge arrival and below-minimum amounts', () => {
    expect(() => resolveHlpDepositUsd6(hlpStep, null)).toThrow('not known yet');
    expect(() => resolveHlpDepositUsd6(hlpStep, 9_999_999n)).toThrow(
      'below the vault minimum',
    );
  });

  it('refuses a bridge-funded step that lost its expected amount', () => {
    const noExpected = { ...hlpStep };
    delete (noExpected as { expectedUsd?: unknown }).expectedUsd;
    // Coercing the missing value to 0 would silently cap the deposit at zero.
    expect(() => resolveHlpDepositUsd6(noExpected, 29_500_000n)).toThrow(
      'missing its expected amount',
    );
  });
});
