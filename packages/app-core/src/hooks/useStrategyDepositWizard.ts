import { extractErrorMessage } from '@core/lib/errors';
import { pollUntil } from '@core/lib/polling';
import {
  initialStrategyDepositWizardState,
  strategyDepositWizardReducer,
  type StrategyWizardStep,
} from '@core/lib/wallet/strategyDepositMachine';
import { useWalletProvider } from '@core/providers/walletContext';
import { getPublicClient } from '@core/services/intentClient';
import { getStrategyDepositPlan } from '@core/services/planOrchestrationService';
import {
  GMX_V2_MARKETS,
  type GmxV2MarketKey,
  MORPHO_VAULTS,
} from '@zapengine/intent-engine';
import {
  NATIVE_TOKEN_ADDRESS,
  type PlanOrchestrationDepositRequest,
  type StrategyChainExecutionGroup,
} from '@zapengine/types/api';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  type Address,
  erc20Abi,
  formatEther,
  formatUnits,
  type Hash,
  parseEther,
} from 'viem';

export type StartStrategyDepositInput = Omit<
  Extract<PlanOrchestrationDepositRequest, { kind: 'strategy' }>,
  'kind' | 'strategyId'
>;

const GAS_RESERVE_WEI = parseEther('0.0005');

class StrategyTransactionRevertedError extends Error {
  constructor() {
    super('Transaction reverted on-chain');
    this.name = 'StrategyTransactionRevertedError';
  }
}

function assertPlannedAccount(
  activeAddress: string | undefined,
  plannedAddress: Address,
): void {
  if (!activeAddress) {
    throw new Error('Reconnect the wallet used to prepare this strategy plan.');
  }
  if (activeAddress.toLowerCase() !== plannedAddress.toLowerCase()) {
    throw new Error(
      'The connected wallet changed. Reconnect the wallet used to prepare this strategy plan.',
    );
  }
}

function marketKeyFromStep(step: StrategyWizardStep): GmxV2MarketKey | null {
  const route = step.transaction?.meta.route;
  if (typeof route !== 'object' || route === null || !('marketKey' in route)) {
    return null;
  }
  const marketKey = String(route.marketKey);
  return marketKey in GMX_V2_MARKETS ? (marketKey as GmxV2MarketKey) : null;
}

async function readPositionBalance(
  step: StrategyWizardStep,
  address: Address,
): Promise<bigint | null> {
  if (!step.chainId || step.kind !== 'transaction') return null;
  const publicClient = getPublicClient(step.chainId);
  const marketKey = marketKeyFromStep(step);
  const positionToken = marketKey
    ? GMX_V2_MARKETS[marketKey].marketToken
    : step.groupId === 'base-morpho' &&
        step.transaction?.meta.intentType === 'SUPPLY'
      ? MORPHO_VAULTS[8453].MOONWELL_USDC
      : null;
  if (!positionToken) return null;
  return publicClient.readContract({
    address: positionToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

async function waitForPositionIncrease(params: {
  step: StrategyWizardStep;
  address: Address;
  baseline: bigint | null;
}): Promise<void> {
  if (params.baseline === null || !params.step.chainId) return;
  await pollUntil({
    fn: () => readPositionBalance(params.step, params.address),
    shouldStop: (balance) => balance !== null && balance > params.baseline!,
    intervalMs: 4_000,
    timeoutMs: marketKeyFromStep(params.step) ? 5 * 60_000 : 90_000,
  });
}

async function assertGroupPreflight(params: {
  group: StrategyChainExecutionGroup;
  address: Address;
}): Promise<void> {
  const publicClient = getPublicClient(params.group.chainId);
  const calls = [...params.group.approvals, ...params.group.calls];
  const transactionValue = calls.reduce(
    (sum, transaction) => sum + BigInt(transaction.value),
    0n,
  );
  const nativeBalance = await publicClient.getBalance({
    address: params.address,
  });
  const isNative =
    params.group.fromToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  if (isNative) {
    const required = transactionValue + GAS_RESERVE_WEI;
    if (nativeBalance < required) {
      throw new Error(
        `Native balance too low on chain ${params.group.chainId}: need ${formatEther(required)} ETH including transaction value and gas, have ${formatEther(nativeBalance)} ETH.`,
      );
    }
    return;
  }

  const tokenBalance = await publicClient.readContract({
    address: params.group.fromToken as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [params.address],
  });
  if (tokenBalance < BigInt(params.group.fromAmount)) {
    throw new Error(
      `Funding balance too low on chain ${params.group.chainId}: need ${formatUnits(BigInt(params.group.fromAmount), 6)}, have ${formatUnits(tokenBalance, 6)}.`,
    );
  }
  if (nativeBalance < transactionValue + GAS_RESERVE_WEI) {
    throw new Error(
      `ETH balance too low on chain ${params.group.chainId} for gas and protocol execution fees.`,
    );
  }
}

export function useStrategyDepositWizard() {
  const wallet = useWalletProvider();
  const [wizard, dispatch] = useReducer(
    strategyDepositWizardReducer,
    initialStrategyDepositWizardState,
  );
  const requestRef = useRef<StartStrategyDepositInput | null>(null);
  const positionBaselines = useRef(new Map<string, bigint | null>());
  const advanceInFlight = useRef(false);
  const walletRef = useRef(wallet);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  const planRequest = useCallback((input: StartStrategyDepositInput) => {
    return getStrategyDepositPlan({
      kind: 'strategy',
      strategyId: 'zap-morpho-gmx-v1',
      ...input,
    });
  }, []);

  const start = useCallback(
    async (input: StartStrategyDepositInput) => {
      requestRef.current = input;
      positionBaselines.current.clear();
      try {
        const plan = await planRequest(input);
        dispatch({ type: 'PLAN_LOADED', plan });
      } catch (error) {
        dispatch({
          type: 'PLAN_LOAD_FAILED',
          message: extractErrorMessage(
            error,
            'Unable to prepare strategy plan',
          ),
        });
        throw error;
      }
    },
    [planRequest],
  );

  const confirmTransaction = useCallback(
    async (step: StrategyWizardStep, hash: Hash, address: Address) => {
      if (!step.chainId)
        throw new Error('Transaction step is missing chain id');
      const receipt = await getPublicClient(
        step.chainId,
      ).waitForTransactionReceipt({
        hash,
      });
      if (receipt.status !== 'success') {
        throw new StrategyTransactionRevertedError();
      }
      await waitForPositionIncrease({
        step,
        address,
        baseline: positionBaselines.current.get(step.id) ?? null,
      });
    },
    [],
  );

  const advance = useCallback(async () => {
    const step = wizard.steps[wizard.currentIndex];
    const input = requestRef.current;
    if (
      !step ||
      !input ||
      wizard.status === 'busy' ||
      advanceInFlight.current
    ) {
      return;
    }

    advanceInFlight.current = true;
    dispatch({ type: 'STEP_STARTED' });
    try {
      const address = input.userAddress as Address;
      assertPlannedAccount(walletRef.current.account?.address, address);
      if (step.kind === 'switch-chain') {
        const refreshed = await planRequest(input);
        dispatch({ type: 'PLAN_REFRESHED', plan: refreshed });
        const group = refreshed.executionGroups.find(
          (candidate) => candidate.id === step.groupId,
        );
        if (!group || !step.chainId) {
          throw new Error('Execution group is missing from refreshed plan');
        }
        await assertGroupPreflight({ group, address });
        const activeWallet = walletRef.current;
        assertPlannedAccount(activeWallet.account?.address, address);
        if (activeWallet.chain?.id !== step.chainId) {
          await activeWallet.switchChain(step.chainId);
        }
        dispatch({ type: 'STEP_CONFIRMED' });
        return;
      }

      if (step.kind === 'mock-bridge') {
        dispatch({ type: 'STEP_CONFIRMED' });
        return;
      }

      const transaction = step.transaction;
      if (!transaction || !step.chainId) {
        throw new Error('Prepared transaction is missing');
      }
      if (!positionBaselines.current.has(step.id)) {
        positionBaselines.current.set(
          step.id,
          await readPositionBalance(step, address),
        );
      }

      let hash = step.transactionHash;
      if (!hash) {
        const activeWallet = walletRef.current;
        assertPlannedAccount(activeWallet.account?.address, address);
        hash = await activeWallet.sendTransaction({
          to: transaction.to as Address,
          data: transaction.data as `0x${string}`,
          value: BigInt(transaction.value),
          chainId: transaction.chainId,
          ...(transaction.gasLimit
            ? { gas: BigInt(transaction.gasLimit) }
            : {}),
        });
        dispatch({ type: 'TX_SUBMITTED', hash });
      }
      await confirmTransaction(step, hash, address);
      dispatch({ type: 'STEP_CONFIRMED' });
    } catch (error) {
      dispatch({
        type: 'STEP_FAILED',
        message: extractErrorMessage(error, 'Strategy step failed'),
        ...(error instanceof StrategyTransactionRevertedError
          ? { clearTransactionHash: true }
          : {}),
      });
    } finally {
      advanceInFlight.current = false;
    }
  }, [confirmTransaction, planRequest, wizard]);

  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);
  const reset = useCallback(() => {
    requestRef.current = null;
    positionBaselines.current.clear();
    advanceInFlight.current = false;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    wizard,
    pending: wizard.status === 'busy',
    start,
    advance,
    retry,
    reset,
  };
}
