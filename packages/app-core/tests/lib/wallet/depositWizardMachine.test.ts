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

function arrivedState(): DepositWizardState {
  return run([
    { type: 'PLAN_LOADED', plan, baselineUsd6: 1_000_000n },
    { type: 'SOURCE_CONFIRMED', transactionHash: '0xbatch' },
    { type: 'BRIDGE_UPDATE', legIndex: 1, status: 'destinationConfirmed' },
    { type: 'HL_ARRIVED', arrivedUsd6: 29_500_000n },
  ]);
}

describe('depositWizardReducer', () => {
  it('walks the reviewed bridge and HLP follow-up to done', () => {
    let state = run([{ type: 'PLAN_LOADED', plan, baselineUsd6: 1_000_000n }]);
    expect(state.stage).toBe('sourceExecution');
    expect(state.hlp.step).toEqual(hlpStep);

    state = run([{ type: 'SOURCE_SUBMITTED' }], state);
    expect(state.legs.every((leg) => leg.status === 'submitted')).toBe(true);

    state = run(
      [{ type: 'SOURCE_CONFIRMED', transactionHash: '0xbatch' }],
      state,
    );
    expect(state.stage).toBe('bridging');

    state = run(
      [{ type: 'BRIDGE_UPDATE', legIndex: 1, status: 'destinationConfirmed' }],
      state,
    );
    expect(state.stage).toBe('hyperliquidDeposit');
    expect(state.hlp.status).toBe('awaitingArrival');

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
  });

  it('arms a sufficient spot plan directly at the vault action', () => {
    const state = run([
      { type: 'SPOT_PLAN_LOADED', plan: spotPlan, spendableUsd6: 10_000_000n },
    ]);
    expect(state.stage).toBe('hyperliquidDeposit');
    expect(state.hlp.status).toBe('arrived');
    expect(state.hlp.step).toEqual(spotPlan.step);
    expect(state.error).toBeNull();
  });

  it('fails closed when live spendable USDC is insufficient', () => {
    const state = run([
      { type: 'SPOT_PLAN_LOADED', plan: spotPlan, spendableUsd6: 9_000_000n },
    ]);
    expect(state.hlp.status).toBe('arrived');
    expect(state.error?.stage).toBe('hyperliquidDeposit');
    expect(state.error?.message).toContain('short by 1000000');
  });

  it('hands the vault action back only when submission definitely failed', () => {
    const submitting = run([{ type: 'HL_SUBMITTED' }], arrivedState());
    expect(submitting.hlp.status).toBe('confirming');
    const state = run([{ type: 'HL_SUBMIT_FAILED' }], submitting);
    expect(state.hlp.status).toBe('arrived');
  });

  it('finishes submitted-unverified after an accepted action cannot be confirmed', () => {
    const state = run(
      [{ type: 'HL_SUBMITTED' }, { type: 'HL_UNVERIFIED' }],
      arrivedState(),
    );
    expect(state.stage).toBe('done');
    expect(state.hlp.status).toBe('submittedUnverified');
    expect(state.error).toBeNull();
  });

  it('ignores late HLP and bridge events after reset', () => {
    const afterReset = run([{ type: 'RESET' }], arrivedState());
    expect(
      run([{ type: 'HL_ARRIVED', arrivedUsd6: 42_000_000n }], afterReset),
    ).toEqual(initialDepositWizardState);
    expect(
      run(
        [{ type: 'BRIDGE_UPDATE', legIndex: 1, status: 'destinationConfirmed' }],
        afterReset,
      ),
    ).toEqual(initialDepositWizardState);
  });

  it('records and clears stage failures via RETRY', () => {
    let state = run([
      { type: 'PLAN_LOADED', plan },
      { type: 'STAGE_FAILED', stage: 'sourceExecution', message: 'boom' },
    ]);
    expect(state.error?.message).toBe('boom');
    state = run([{ type: 'RETRY' }], state);
    expect(state.error).toBeNull();
  });
});

describe('hlpSpendableShortfallUsd6', () => {
  it('returns only the missing spendable amount', () => {
    expect(hlpSpendableShortfallUsd6(10_000_000n, 7_000_000n)).toBe(3_000_000n);
    expect(hlpSpendableShortfallUsd6(10_000_000n, 10_000_000n)).toBe(0n);
    expect(hlpSpendableShortfallUsd6(10_000_000n, 20_000_000n)).toBe(0n);
  });
});

describe('resolveHlpDepositUsd6', () => {
  it('uses the fixed amount for direct HLP deposits', () => {
    expect(resolveHlpDepositUsd6(spotPlan.step, null)).toBe(10_000_000n);
  });

  it('uses the bridge arrival but caps unrelated extra credits', () => {
    expect(resolveHlpDepositUsd6(hlpStep, 29_500_000n)).toBe(29_500_000n);
    expect(resolveHlpDepositUsd6(hlpStep, 41_000_000n)).toBe(29_580_000n);
  });

  it('rejects missing bridge arrival and below-minimum amounts', () => {
    expect(() => resolveHlpDepositUsd6(hlpStep, null)).toThrow('not known yet');
    expect(() => resolveHlpDepositUsd6(hlpStep, 9_999_999n)).toThrow(
      'below the vault minimum',
    );
  });
});
