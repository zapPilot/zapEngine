import {
  depositWizardReducer,
  initialDepositWizardState,
  resolveHlpDepositUsd6,
  type DepositWizardEvent,
  type DepositWizardState,
} from '@core/lib/wallet/depositWizardMachine';
import type {
  DepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const hlpStep: HyperliquidVaultDepositStep = {
  kind: 'hyperliquid-vault-deposit',
  chainId: 1337,
  afterLegIndex: 1,
  amount: { source: 'bridge-output', legIndex: 1 },
  expectedUsd: '29000000',
  minDepositUsd: '5000000',
  action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
  signing: {
    scheme: 'hyperliquid-l1-action',
    hyperliquidChain: 'Mainnet',
    apiUrl: 'https://api.hyperliquid.xyz',
  },
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

function run(
  events: DepositWizardEvent[],
  from: DepositWizardState = initialDepositWizardState,
): DepositWizardState {
  return events.reduce(depositWizardReducer, from);
}

describe('depositWizardReducer', () => {
  it('walks the full happy path from configure to done', () => {
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

  it('resets to the initial state', () => {
    const state = run([{ type: 'PLAN_LOADED', plan }, { type: 'RESET' }]);
    expect(state).toEqual(initialDepositWizardState);
  });
});

describe('resolveHlpDepositUsd6', () => {
  it('uses the actually-received amount for bridge-output steps', () => {
    expect(resolveHlpDepositUsd6(hlpStep, 29_500_000n)).toBe(29_500_000n);
  });

  it('uses the fixed amount when the plan pinned one', () => {
    expect(
      resolveHlpDepositUsd6(
        { ...hlpStep, amount: { source: 'fixed', amount: '12000000' } },
        null,
      ),
    ).toBe(12_000_000n);
  });

  it('throws before arrival and below the vault minimum', () => {
    expect(() => resolveHlpDepositUsd6(hlpStep, null)).toThrow('not known yet');
    expect(() => resolveHlpDepositUsd6(hlpStep, 4_999_999n)).toThrow(
      'below the vault minimum',
    );
  });
});
