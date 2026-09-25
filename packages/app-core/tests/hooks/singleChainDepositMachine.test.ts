import {
  initialSingleChainDepositWizardState,
  requestChainId,
  singleChainDepositWizardReducer,
  type SingleChainDepositRequest,
} from '@core/hooks/singleChainDepositMachine';
import type { DepositPlan } from '@zapengine/types/api';
import { describe, expect, it } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const HASH = `0x${'a'.repeat(64)}` as const;

const investRequest: SingleChainDepositRequest = {
  kind: 'invest',
  userAddress: USER,
  fromToken: TOKEN,
  fromAmount: '1000000',
  sourceChainId: 8453,
  split: { '8453': 1 },
};

const basketRequest: SingleChainDepositRequest = {
  kind: 'gmx-v2-basket',
  userAddress: USER,
  fromToken: TOKEN,
  amount: '1000000',
};

const gmxRequest: SingleChainDepositRequest = {
  kind: 'gmx-v2',
  userAddress: USER,
  fromToken: TOKEN,
  amount: '1000000',
  marketKey: 'btc-usdc',
};

const plan: DepositPlan = {
  legs: [],
  approvals: [],
  calls: [],
  totalGasUsd: '0',
  sourceChainId: 8453,
};

function prepared(request: SingleChainDepositRequest = investRequest) {
  return singleChainDepositWizardReducer(initialSingleChainDepositWizardState, {
    type: 'PREPARE_STARTED',
    request,
  });
}

describe('singleChainDepositMachine', () => {
  it('derives chain/protocol labels for invest, basket, and single-market requests', () => {
    expect(requestChainId(investRequest)).toBe(8453);
    expect(requestChainId(gmxRequest)).toBe(42161);

    const invest = prepared(investRequest);
    expect(invest.steps[2]).toMatchObject({
      label: 'Verify Morpho Moonwell position',
      detail: 'Wait for Moonwell USDC vault shares to increase.',
    });

    const basket = prepared(basketRequest);
    expect(basket.steps[2]).toMatchObject({
      label: 'Verify GMX 2-pool basket position',
      detail: 'Wait for both GMX market-token balances to increase.',
    });

    const gmx = prepared(gmxRequest);
    expect(gmx.steps[2]).toMatchObject({
      label: 'Verify GMX BTC/USDC position',
      detail: 'Wait for the GMX market-token balance to increase.',
    });
  });

  it('covers plan lifecycle and refresh events', () => {
    const start = prepared();
    const loaded = singleChainDepositWizardReducer(start, {
      type: 'PLAN_LOADED',
      plan,
    });
    expect(loaded).toMatchObject({
      plan,
      currentIndex: 1,
      status: 'ready',
      error: null,
    });
    expect(loaded.steps.map((step) => step.status)).toEqual([
      'confirmed',
      'ready',
      'locked',
    ]);

    const refreshedPlan = { ...plan, totalGasUsd: '1' };
    expect(
      singleChainDepositWizardReducer(loaded, {
        type: 'PLAN_REFRESHED',
        plan: refreshedPlan,
      }).plan,
    ).toBe(refreshedPlan);

    const failed = singleChainDepositWizardReducer(start, {
      type: 'PLAN_LOAD_FAILED',
      message: 'plan failed',
    });
    expect(failed).toMatchObject({ status: 'failed', error: 'plan failed' });
    expect(failed.steps[0]?.status).toBe('failed');
  });

  it('tracks batch submission with and without optional hashes', () => {
    let state = singleChainDepositWizardReducer(prepared(), {
      type: 'PLAN_LOADED',
      plan,
    });
    state = singleChainDepositWizardReducer(state, { type: 'BATCH_STARTED' });
    expect(state).toMatchObject({ status: 'busy', error: null });
    expect(state.steps[1]?.status).toBe('submitting');

    state = singleChainDepositWizardReducer(state, {
      type: 'BATCH_SUBMITTED',
      callsId: 'calls-1',
    });
    expect(state.steps[1]).toMatchObject({
      status: 'confirming',
      callsId: 'calls-1',
    });

    const confirmedWithoutHash = singleChainDepositWizardReducer(state, {
      type: 'BATCH_CONFIRMED',
    });
    expect(confirmedWithoutHash.steps[1]?.transactionHash).toBeUndefined();
    const confirmedWithHash = singleChainDepositWizardReducer(state, {
      type: 'BATCH_CONFIRMED',
      transactionHash: HASH,
    });
    expect(confirmedWithHash.steps[1]?.transactionHash).toBe(HASH);

    const completedWithMetadata = singleChainDepositWizardReducer(state, {
      type: 'BATCH_COMPLETED',
      callsId: 'calls-1',
      transactionHash: HASH,
    });
    expect(completedWithMetadata).toMatchObject({
      currentIndex: 2,
      status: 'ready',
    });
    expect(completedWithMetadata.steps[1]).toMatchObject({
      status: 'confirmed',
      callsId: 'calls-1',
      transactionHash: HASH,
    });
    expect(completedWithMetadata.steps[2]?.status).toBe('ready');

    const completedWithoutMetadata = singleChainDepositWizardReducer(state, {
      type: 'BATCH_COMPLETED',
    });
    expect(completedWithoutMetadata.steps[1]?.callsId).toBe('calls-1');
    expect(completedWithoutMetadata.steps[1]?.transactionHash).toBeUndefined();
  });

  it('distinguishes submitted and non-submitted batch failures', () => {
    const state = singleChainDepositWizardReducer(prepared(), {
      type: 'PLAN_LOADED',
      plan,
    });

    const notSubmitted = singleChainDepositWizardReducer(state, {
      type: 'BATCH_FAILED',
      message: 'rejected',
      submitted: false,
      recovery: 'wallet-delegation',
    });
    expect(notSubmitted).toMatchObject({
      status: 'failed',
      error: 'rejected',
      recovery: 'wallet-delegation',
    });
    expect(notSubmitted.steps[1]?.status).toBe('failed');

    const submitted = singleChainDepositWizardReducer(state, {
      type: 'BATCH_FAILED',
      message: 'uncertain',
      submitted: true,
      recovery: 'wallet-delegation',
    });
    expect(submitted.currentIndex).toBe(2);
    expect(submitted.recovery).toBeNull();
    expect(submitted.error).toContain('already submitted');
    expect(submitted.steps[2]?.status).toBe('failed');
  });

  it('covers settlement success/failure, retry branches, and reset', () => {
    let state = singleChainDepositWizardReducer(prepared(), {
      type: 'PLAN_LOADED',
      plan,
    });
    state = singleChainDepositWizardReducer(state, { type: 'BATCH_COMPLETED' });

    const settling = singleChainDepositWizardReducer(state, {
      type: 'SETTLEMENT_STARTED',
    });
    expect(settling).toMatchObject({ status: 'busy', error: null });
    expect(settling.steps[2]?.status).toBe('confirming');

    const failed = singleChainDepositWizardReducer(settling, {
      type: 'SETTLEMENT_FAILED',
      message: 'not settled',
    });
    expect(failed).toMatchObject({ status: 'failed', error: 'not settled' });
    expect(failed.steps[2]?.status).toBe('failed');

    const retried = singleChainDepositWizardReducer(failed, { type: 'RETRY' });
    expect(retried).toMatchObject({
      status: 'ready',
      error: null,
      recovery: null,
    });
    expect(retried.steps[2]?.status).toBe('ready');

    const done = singleChainDepositWizardReducer(settling, {
      type: 'SETTLEMENT_CONFIRMED',
    });
    expect(done).toMatchObject({
      currentIndex: 3,
      status: 'done',
      error: null,
      recovery: null,
    });
    expect(done.steps[1]?.status).toBe('confirmed');
    expect(done.steps[2]?.status).toBe('confirmed');

    const retryWithoutStep = singleChainDepositWizardReducer(
      {
        ...initialSingleChainDepositWizardState,
        error: 'old',
        recovery: 'wallet-delegation',
      },
      { type: 'RETRY' },
    );
    expect(retryWithoutStep).toEqual(initialSingleChainDepositWizardState);

    expect(singleChainDepositWizardReducer(done, { type: 'RESET' })).toBe(
      initialSingleChainDepositWizardState,
    );
  });
});
