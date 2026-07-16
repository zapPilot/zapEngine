import type { StrategyDepositPlan } from '@zapengine/types/api';
import { encodeFunctionData, erc20Abi } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  initialStrategyDepositWizardState,
  strategyDepositWizardReducer,
  strategyWizardSteps,
} from '../../../src/lib/wallet/strategyDepositMachine';

const tx = (chainId: number, intentType: string, data = '0x1234') => ({
  to: '0x1111111111111111111111111111111111111111',
  data,
  value: '0',
  chainId,
  meta: { intentType },
});

const PLAN: StrategyDepositPlan = {
  kind: 'strategy',
  strategyId: 'zap-morpho-gmx-v1',
  totalUsd6: '100000000',
  allocations: [
    {
      id: 'morpho-base-usdc',
      label: 'Morpho',
      weightBps: 4000,
      chainId: 8453,
      protocol: 'morpho',
      fromToken: '0x1111111111111111111111111111111111111111',
      fromAmount: '40000000',
      toToken: '0x2222222222222222222222222222222222222222',
      toAmountMin: '40000000',
      gasUsd: '0',
      durationSec: 10,
    },
    {
      id: 'gmx-btc-usdc',
      label: 'GMX BTC',
      weightBps: 3000,
      chainId: 42161,
      protocol: 'gmx-v2',
      marketKey: 'btc-usdc',
      fromToken: '0x3333333333333333333333333333333333333333',
      fromAmount: '30000000',
      toToken: '0x4444444444444444444444444444444444444444',
      toAmountMin: '30000000',
      gasUsd: '0',
      durationSec: 60,
    },
    {
      id: 'gmx-eth-usdc',
      label: 'GMX ETH',
      weightBps: 3000,
      chainId: 42161,
      protocol: 'gmx-v2',
      marketKey: 'eth-usdc',
      fromToken: '0x3333333333333333333333333333333333333333',
      fromAmount: '30000000',
      toToken: '0x5555555555555555555555555555555555555555',
      toAmountMin: '30000000',
      gasUsd: '0',
      durationSec: 60,
    },
  ],
  executionGroups: [
    {
      id: 'base-morpho',
      chainId: 8453,
      fromToken: '0x1111111111111111111111111111111111111111',
      fromAmount: '40000000',
      approvals: [tx(8453, 'ERC20_APPROVE')],
      calls: [tx(8453, 'SUPPLY')],
      allocationIds: ['morpho-base-usdc'],
      gasUsd: '0',
    },
    {
      id: 'arbitrum-gmx',
      chainId: 42161,
      fromToken: '0x3333333333333333333333333333333333333333',
      fromAmount: '60000000',
      approvals: [tx(42161, 'ERC20_APPROVE')],
      calls: [
        {
          ...tx(42161, 'SUPPLY', '0xabcd'),
          meta: {
            intentType: 'SUPPLY',
            route: { tool: 'gmx-v2-direct', marketKey: 'btc-usdc' },
          },
        },
        {
          ...tx(42161, 'SUPPLY', '0xef01'),
          meta: {
            intentType: 'SUPPLY',
            route: { tool: 'gmx-v2-direct', marketKey: 'eth-usdc' },
          },
        },
      ],
      allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'],
      gasUsd: '0',
    },
  ],
  checkpoints: [
    {
      kind: 'mock-bridge',
      id: 'base-to-arbitrum',
      fromChainId: 8453,
      toChainId: 42161,
      afterGroupId: 'base-morpho',
      beforeGroupId: 'arbitrum-gmx',
      amountUsd6: '60000000',
      disclosure: 'No funds move.',
    },
  ],
  totalGasUsd: '0',
};

describe('strategyDepositMachine', () => {
  it('creates one manual CTA per chain switch, approval, call and checkpoint', () => {
    const steps = strategyWizardSteps(PLAN);
    expect(steps.map((step) => step.kind)).toEqual([
      'switch-chain',
      'transaction',
      'transaction',
      'mock-bridge',
      'switch-chain',
      'transaction',
      'transaction',
      'transaction',
    ]);
    expect(steps[0]!.status).toBe('ready');
    expect(steps.slice(1).every((step) => step.status === 'locked')).toBe(true);
  });

  it('labels Base ETH approval, swap, and Morpho deposit as separate wallet actions', () => {
    const baseUsdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const morphoVault = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
    const nativePlan: StrategyDepositPlan = {
      ...PLAN,
      executionGroups: [
        {
          ...PLAN.executionGroups[0]!,
          fromToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          fromAmount: '10000000000000000',
          approvals: [
            {
              to: baseUsdc,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [morphoVault, 39800000n],
              }),
              value: '0',
              chainId: 8453,
              meta: { intentType: 'ERC20_APPROVE' },
            },
          ],
          calls: [
            {
              ...tx(8453, 'SWAP'),
              meta: {
                intentType: 'SWAP',
                route: {
                  strategyAllocationId: 'morpho-base-usdc',
                  action: {
                    fromToken: { symbol: 'ETH' },
                    toToken: { symbol: 'USDC' },
                  },
                },
              },
            },
            {
              ...tx(8453, 'SUPPLY'),
              meta: {
                intentType: 'SUPPLY',
                route: { strategyAllocationId: 'morpho-base-usdc' },
              },
            },
          ],
        },
        PLAN.executionGroups[1]!,
      ],
    };

    const labels = strategyWizardSteps(nativePlan).map((step) => step.label);
    expect(labels.slice(0, 5)).toEqual([
      'Switch to Base',
      'Approve USDC',
      'Swap ETH → USDC',
      'Deposit Morpho vault',
      'Confirm mock bridge',
    ]);
  });

  it('only unlocks the next step after confirmation', () => {
    let state = strategyDepositWizardReducer(
      initialStrategyDepositWizardState,
      { type: 'PLAN_LOADED', plan: PLAN },
    );
    state = strategyDepositWizardReducer(state, { type: 'STEP_STARTED' });
    state = strategyDepositWizardReducer(state, { type: 'STEP_CONFIRMED' });
    expect(state.steps[0]!.status).toBe('confirmed');
    expect(state.steps[1]!.status).toBe('ready');
    expect(state.currentIndex).toBe(1);
  });

  it('keeps a submitted hash during retry so execution can poll instead of resend', () => {
    let state = strategyDepositWizardReducer(
      initialStrategyDepositWizardState,
      { type: 'PLAN_LOADED', plan: PLAN },
    );
    state = strategyDepositWizardReducer(state, { type: 'STEP_CONFIRMED' });
    state = strategyDepositWizardReducer(state, { type: 'STEP_STARTED' });
    state = strategyDepositWizardReducer(state, {
      type: 'TX_SUBMITTED',
      hash: `0x${'a'.repeat(64)}`,
    });
    state = strategyDepositWizardReducer(state, {
      type: 'STEP_FAILED',
      message: 'Settlement timeout',
    });
    state = strategyDepositWizardReducer(state, { type: 'RETRY' });
    expect(state.steps[1]!.status).toBe('confirming');
    expect(state.steps[1]!.transactionHash).toBe(`0x${'a'.repeat(64)}`);
  });

  it('clears a reverted transaction hash so retry can submit a replacement', () => {
    let state = strategyDepositWizardReducer(
      initialStrategyDepositWizardState,
      { type: 'PLAN_LOADED', plan: PLAN },
    );
    state = strategyDepositWizardReducer(state, { type: 'STEP_CONFIRMED' });
    state = strategyDepositWizardReducer(state, { type: 'STEP_STARTED' });
    state = strategyDepositWizardReducer(state, {
      type: 'TX_SUBMITTED',
      hash: `0x${'a'.repeat(64)}`,
    });
    state = strategyDepositWizardReducer(state, {
      type: 'STEP_FAILED',
      message: 'Transaction reverted on-chain',
      clearTransactionHash: true,
    });

    expect(state.steps[1]!.status).toBe('failed');
    expect(state.steps[1]!.transactionHash).toBeUndefined();

    state = strategyDepositWizardReducer(state, { type: 'RETRY' });
    expect(state.steps[1]!.status).toBe('ready');
  });
});
