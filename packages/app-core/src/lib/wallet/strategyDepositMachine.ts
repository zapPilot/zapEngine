import {
  DEPOSIT_USDC_ADDRESSES,
  DEPOSIT_USDT_ADDRESSES,
  type PreparedTransaction,
  type StrategyDepositPlan,
} from '@zapengine/types/api';
import { decodeFunctionData, erc20Abi, formatUnits, type Hash } from 'viem';

export type StrategyWizardStepKind =
  | 'switch-chain'
  | 'transaction'
  | 'mock-bridge';
export type StrategyWizardStepStatus =
  | 'locked'
  | 'ready'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'failed';

export interface StrategyWizardStep {
  id: string;
  groupId?: 'base-morpho' | 'arbitrum-gmx';
  chainId?: number;
  kind: StrategyWizardStepKind;
  label: string;
  detail: string;
  status: StrategyWizardStepStatus;
  transaction?: PreparedTransaction;
  transactionHash?: Hash;
}

export interface StrategyDepositWizardState {
  plan: StrategyDepositPlan | null;
  steps: StrategyWizardStep[];
  currentIndex: number;
  status: 'idle' | 'ready' | 'busy' | 'done';
  error: string | null;
}

export type StrategyDepositWizardEvent =
  | { type: 'PLAN_LOADED'; plan: StrategyDepositPlan }
  | { type: 'PLAN_LOAD_FAILED'; message: string }
  | { type: 'PLAN_REFRESHED'; plan: StrategyDepositPlan }
  | { type: 'STEP_STARTED' }
  | { type: 'TX_SUBMITTED'; hash: Hash }
  | { type: 'STEP_CONFIRMED' }
  | {
      type: 'STEP_FAILED';
      message: string;
      clearTransactionHash?: boolean;
    }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export const initialStrategyDepositWizardState: StrategyDepositWizardState = {
  plan: null,
  steps: [],
  currentIndex: 0,
  status: 'idle',
  error: null,
};

interface TokenDisplay {
  symbol: string;
  decimals: number;
}

function tokenDisplay(address: string, chainId: number): TokenDisplay {
  if (
    address.toLowerCase() === DEPOSIT_USDC_ADDRESSES[chainId]?.toLowerCase()
  ) {
    return { symbol: 'USDC', decimals: 6 };
  }
  if (
    address.toLowerCase() === DEPOSIT_USDT_ADDRESSES[chainId]?.toLowerCase()
  ) {
    return { symbol: 'USDT', decimals: 6 };
  }
  return { symbol: 'token', decimals: 18 };
}

function compactUnits(value: bigint, decimals: number): string {
  const [whole = '0', fraction = ''] = formatUnits(value, decimals).split('.');
  const truncated = fraction.slice(0, 6);
  let end = truncated.length;
  while (end > 0 && truncated[end - 1] === '0') {
    end -= 1;
  }
  const compactFraction = truncated.slice(0, end);
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function allocationLabel(route: unknown): string | null {
  if (typeof route !== 'object' || route === null) return null;
  const id = (route as { strategyAllocationId?: unknown }).strategyAllocationId;
  if (id === 'morpho-base-usdc') return 'Morpho';
  if (id === 'gmx-btc-usdc') return 'GMX BTC/USDC';
  if (id === 'gmx-eth-usdc') return 'GMX ETH/USDC';
  return null;
}

function swapSymbols(route: unknown): { from: string; to: string } | null {
  if (typeof route !== 'object' || route === null) return null;
  const action = (route as { action?: unknown }).action;
  if (typeof action !== 'object' || action === null) return null;
  const fromToken = (action as { fromToken?: unknown }).fromToken;
  const toToken = (action as { toToken?: unknown }).toToken;
  if (
    typeof fromToken !== 'object' ||
    fromToken === null ||
    typeof toToken !== 'object' ||
    toToken === null
  ) {
    return null;
  }
  const from = (fromToken as { symbol?: unknown }).symbol;
  const to = (toToken as { symbol?: unknown }).symbol;
  return typeof from === 'string' && typeof to === 'string'
    ? { from, to }
    : null;
}

function approvalDetails(
  tx: PreparedTransaction,
  groupId: StrategyWizardStep['groupId'],
): { label: string; detail: string } {
  const token = tokenDisplay(tx.to, tx.chainId);
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as `0x${string}`,
    });
    if (decoded.functionName === 'approve') {
      const [spender, amount] = decoded.args;
      const purpose =
        groupId === 'base-morpho'
          ? 'Morpho vault'
          : token.symbol === 'USDC'
            ? 'GMX markets'
            : 'same-chain swaps';
      return {
        label: `Approve ${token.symbol}`,
        detail: `${compactUnits(amount, token.decimals)} ${token.symbol} · ${purpose} · ${shortAddress(spender)}`,
      };
    }
  } catch {
    // A schema-valid opaque call still gets a conservative, honest label.
  }
  return {
    label: `Approve ${token.symbol}`,
    detail: `${groupId === 'base-morpho' ? 'Morpho' : 'Arbitrum'} · ${shortAddress(tx.to)}`,
  };
}

function routeDetails(
  tx: PreparedTransaction,
  groupId: StrategyWizardStep['groupId'],
): {
  label: string;
  detail: string;
} {
  if (
    tx.meta.intentType === 'APPROVAL' ||
    tx.meta.intentType === 'ERC20_APPROVE'
  ) {
    return approvalDetails(tx, groupId);
  }
  if (tx.meta.intentType === 'SWAP') {
    const symbols = swapSymbols(tx.meta.route);
    const target = allocationLabel(tx.meta.route);
    return {
      label: symbols
        ? `Swap ${symbols.from} → ${symbols.to}`
        : 'Swap to protocol asset',
      detail: `LI.FI · same chain${target ? ` · for ${target}` : ''}`,
    };
  }

  const route = tx.meta.route;
  if (typeof route === 'object' && route !== null && 'marketKey' in route) {
    const marketKey = String(route.marketKey);
    return {
      label: marketKey.startsWith('btc')
        ? 'Deposit GMX BTC/USDC'
        : 'Deposit GMX ETH/USDC',
      detail: 'Create request · keeper settlement · exact wallet action',
    };
  }
  return {
    label: 'Deposit Morpho vault',
    detail: 'Moonwell USDC · Base · exact wallet action',
  };
}

function transactionSteps(
  group: StrategyDepositPlan['executionGroups'][number],
  transactions: readonly PreparedTransaction[],
  category: 'approval' | 'call',
): StrategyWizardStep[] {
  return transactions.map((transaction, index) => ({
    id: `${group.id}:${category}:${index}`,
    groupId: group.id,
    chainId: group.chainId,
    kind: 'transaction',
    ...routeDetails(transaction, group.id),
    transaction,
    status: 'locked',
  }));
}

export function strategyWizardSteps(
  plan: StrategyDepositPlan,
): StrategyWizardStep[] {
  const result: StrategyWizardStep[] = [];

  for (const [groupIndex, group] of plan.executionGroups.entries()) {
    result.push({
      id: `${group.id}:switch`,
      groupId: group.id,
      chainId: group.chainId,
      kind: 'switch-chain',
      label: `Switch to ${group.chainId === 8453 ? 'Base' : 'Arbitrum'}`,
      detail: 'Refresh quote and run balance preflight',
      status: 'locked',
    });
    result.push(
      ...transactionSteps(group, group.approvals, 'approval'),
      ...transactionSteps(group, group.calls, 'call'),
    );

    if (groupIndex === 0) {
      const checkpoint = plan.checkpoints[0];
      if (!checkpoint) {
        throw new Error('Strategy plan is missing its mock checkpoint');
      }
      result.push({
        id: checkpoint.id,
        kind: 'mock-bridge',
        label: 'Confirm mock bridge',
        detail: 'No transaction · no assets move',
        status: 'locked',
      });
    }
  }

  if (result[0]) result[0].status = 'ready';
  return result;
}

function refreshSteps(
  previous: readonly StrategyWizardStep[],
  plan: StrategyDepositPlan,
  currentIndex: number,
): StrategyWizardStep[] {
  const fresh = strategyWizardSteps(plan);
  const current = previous[currentIndex];
  if (!current) return fresh;
  const freshCurrentIndex = fresh.findIndex((step) => step.id === current.id);
  if (freshCurrentIndex < 0) return [...previous];
  const freshCurrent = fresh[freshCurrentIndex];
  if (!freshCurrent) return [...previous];
  return [
    ...previous.slice(0, currentIndex),
    { ...freshCurrent, status: current.status },
    ...fresh.slice(freshCurrentIndex + 1),
  ];
}

function unlockCurrent(
  steps: StrategyWizardStep[],
  currentIndex: number,
): StrategyWizardStep[] {
  return steps.map((step, index) =>
    index === currentIndex && step.status === 'locked'
      ? { ...step, status: 'ready' }
      : step,
  );
}

export function strategyDepositWizardReducer(
  state: StrategyDepositWizardState,
  event: StrategyDepositWizardEvent,
): StrategyDepositWizardState {
  switch (event.type) {
    case 'RESET':
      return initialStrategyDepositWizardState;
    case 'PLAN_LOADED':
      return {
        plan: event.plan,
        steps: strategyWizardSteps(event.plan),
        currentIndex: 0,
        status: 'ready',
        error: null,
      };
    case 'PLAN_LOAD_FAILED':
      return {
        ...initialStrategyDepositWizardState,
        status: 'ready',
        error: event.message,
      };
    case 'PLAN_REFRESHED': {
      const steps = refreshSteps(state.steps, event.plan, state.currentIndex);
      return {
        ...state,
        plan: event.plan,
        steps: unlockCurrent(steps, state.currentIndex),
      };
    }
    case 'STEP_STARTED':
      return {
        ...state,
        status: 'busy',
        error: null,
        steps: state.steps.map((step, index) =>
          index === state.currentIndex
            ? { ...step, status: 'submitting' }
            : step,
        ),
      };
    case 'TX_SUBMITTED':
      return {
        ...state,
        steps: state.steps.map((step, index) =>
          index === state.currentIndex
            ? { ...step, status: 'confirming', transactionHash: event.hash }
            : step,
        ),
      };
    case 'STEP_CONFIRMED': {
      const nextIndex = state.currentIndex + 1;
      const steps = unlockCurrent(
        state.steps.map((step, index) =>
          index === state.currentIndex
            ? { ...step, status: 'confirmed' }
            : step,
        ),
        nextIndex,
      );
      const done = nextIndex >= steps.length;
      return {
        ...state,
        steps,
        currentIndex: nextIndex,
        status: done ? 'done' : 'ready',
        error: null,
      };
    }
    case 'STEP_FAILED':
      return {
        ...state,
        status: 'ready',
        error: event.message,
        steps: state.steps.map((step, index) => {
          if (index !== state.currentIndex) return step;
          if (event.clearTransactionHash) {
            const retryableStep = { ...step };
            delete retryableStep.transactionHash;
            return { ...retryableStep, status: 'failed' };
          }
          return !step.transactionHash ? { ...step, status: 'failed' } : step;
        }),
      };
    case 'RETRY':
      return {
        ...state,
        error: null,
        steps: state.steps.map((step, index) =>
          index === state.currentIndex && step.status === 'failed'
            ? { ...step, status: 'ready' }
            : step,
        ),
      };
    default:
      return state;
  }
}
