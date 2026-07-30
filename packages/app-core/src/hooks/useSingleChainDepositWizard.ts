import { extractErrorMessage } from '@core/lib/errors';
import { pollUntil } from '@core/lib/polling';
import { executeDepositPlanWithWallet } from '@core/lib/wallet/executeDepositPlan';
import { useWalletProvider } from '@core/providers/walletContext';
import { getPublicClient } from '@core/services/intentClient';
import { getDepositPlan } from '@core/services/planOrchestrationService';
import {
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  MORPHO_VAULTS,
} from '@zapengine/intent-engine';
import {
  type DepositPlan,
  NATIVE_TOKEN_ADDRESS,
  type PlanOrchestrationDepositRequest,
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
import { arbitrum, base } from 'viem/chains';

const STEP_ID = {
  preparePlan: 'prepare-plan',
  executeBatch: 'execute-batch',
  verifyPosition: 'verify-position',
} as const;

export type SingleChainDepositRequest = Exclude<
  PlanOrchestrationDepositRequest,
  { kind: 'strategy' }
>;

export type SingleChainDepositWizardStepKind =
  | 'prepare'
  | 'batch'
  | 'settlement';

export type SingleChainDepositWizardStepStatus =
  | 'locked'
  | 'ready'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'failed';

export interface SingleChainDepositWizardStep {
  id:
    | typeof STEP_ID.preparePlan
    | typeof STEP_ID.executeBatch
    | typeof STEP_ID.verifyPosition;
  kind: SingleChainDepositWizardStepKind;
  label: string;
  detail: string;
  chainId: number;
  status: SingleChainDepositWizardStepStatus;
  transactionHash?: Hash;
  callsId?: string;
}

export interface SingleChainDepositWizardState {
  plan: DepositPlan | null;
  steps: SingleChainDepositWizardStep[];
  currentIndex: number;
  status: 'idle' | 'ready' | 'busy' | 'done' | 'failed';
  error: string | null;
}

type SingleChainDepositWizardEvent =
  | { type: 'PREPARE_STARTED'; request: SingleChainDepositRequest }
  | { type: 'PLAN_LOADED'; plan: DepositPlan }
  | { type: 'PLAN_LOAD_FAILED'; message: string }
  | { type: 'PLAN_REFRESHED'; plan: DepositPlan }
  | { type: 'BATCH_STARTED' }
  | { type: 'BATCH_SUBMITTED'; callsId: string }
  | { type: 'BATCH_CONFIRMED'; transactionHash?: Hash }
  | {
      type: 'BATCH_COMPLETED';
      callsId?: string;
      transactionHash?: Hash;
    }
  | { type: 'BATCH_FAILED'; message: string; submitted: boolean }
  | { type: 'SETTLEMENT_STARTED' }
  | { type: 'SETTLEMENT_CONFIRMED' }
  | { type: 'SETTLEMENT_FAILED'; message: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export const initialSingleChainDepositWizardState: SingleChainDepositWizardState =
  {
    plan: null,
    steps: [],
    currentIndex: 0,
    status: 'idle',
    error: null,
  };

const GAS_RESERVE_WEI = parseEther('0.0005');

function requestChainId(request: SingleChainDepositRequest): number {
  return request.kind === 'invest' ? request.sourceChainId : arbitrum.id;
}

function requestProtocolLabel(request: SingleChainDepositRequest): string {
  return request.kind === 'invest' ? 'Morpho Moonwell' : 'GMX BTC/USDC';
}

function createSteps(
  request: SingleChainDepositRequest,
): SingleChainDepositWizardStep[] {
  const chainId = requestChainId(request);
  const chainName = chainId === base.id ? 'Base' : 'Arbitrum';
  const protocol = requestProtocolLabel(request);

  return [
    {
      id: 'prepare-plan',
      kind: 'prepare',
      label: 'Prepare deposit plan',
      detail: `Build the ${chainName} route for ${protocol}.`,
      chainId,
      status: 'submitting',
    },
    {
      id: STEP_ID.executeBatch,
      kind: 'batch',
      label: 'Execute atomic batch',
      detail: `Approve and deposit on ${chainName} in one wallet confirmation.`,
      chainId,
      status: 'locked',
    },
    {
      id: STEP_ID.verifyPosition,
      kind: 'settlement',
      label: `Verify ${protocol} position`,
      detail:
        request.kind === 'invest'
          ? 'Wait for Moonwell USDC vault shares to increase.'
          : 'Wait for GMX BTC/USDC market tokens to settle.',
      chainId,
      status: 'locked',
    },
  ];
}

function patchStep(
  steps: SingleChainDepositWizardStep[],
  id: SingleChainDepositWizardStep['id'],
  patch: Partial<SingleChainDepositWizardStep>,
): SingleChainDepositWizardStep[] {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

export function singleChainDepositWizardReducer(
  state: SingleChainDepositWizardState,
  event: SingleChainDepositWizardEvent,
): SingleChainDepositWizardState {
  switch (event.type) {
    case 'PREPARE_STARTED':
      return {
        plan: null,
        steps: createSteps(event.request),
        currentIndex: 0,
        status: 'busy',
        error: null,
      };

    case 'PLAN_LOADED':
      return {
        ...state,
        plan: event.plan,
        steps: patchStep(
          patchStep(state.steps, 'prepare-plan', { status: 'confirmed' }),
          STEP_ID.executeBatch,
          { status: 'ready' },
        ),
        currentIndex: 1,
        status: 'ready',
        error: null,
      };

    case 'PLAN_LOAD_FAILED':
      return {
        ...state,
        steps: patchStep(state.steps, 'prepare-plan', { status: 'failed' }),
        status: 'failed',
        error: event.message,
      };

    case 'PLAN_REFRESHED':
      return { ...state, plan: event.plan };

    case 'BATCH_STARTED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.executeBatch, {
          status: 'submitting',
        }),
        status: 'busy',
        error: null,
      };

    case 'BATCH_SUBMITTED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.executeBatch, {
          status: 'confirming',
          callsId: event.callsId,
        }),
      };

    case 'BATCH_CONFIRMED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.executeBatch, {
          status: 'confirming',
          ...(event.transactionHash
            ? { transactionHash: event.transactionHash }
            : {}),
        }),
      };

    case 'BATCH_COMPLETED': {
      const batchPatch: Partial<SingleChainDepositWizardStep> = {
        status: 'confirmed',
        ...(event.callsId ? { callsId: event.callsId } : {}),
        ...(event.transactionHash
          ? { transactionHash: event.transactionHash }
          : {}),
      };
      return {
        ...state,
        steps: patchStep(
          patchStep(state.steps, STEP_ID.executeBatch, batchPatch),
          STEP_ID.verifyPosition,
          { status: 'ready' },
        ),
        currentIndex: 2,
        status: 'ready',
        error: null,
      };
    }

    case 'BATCH_FAILED':
      if (event.submitted) {
        return {
          ...state,
          steps: patchStep(state.steps, STEP_ID.verifyPosition, {
            status: 'failed',
          }),
          currentIndex: 2,
          status: 'failed',
          error: `${event.message} The batch was already submitted; retry will only check the position to avoid a duplicate deposit.`,
        };
      }
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.executeBatch, {
          status: 'failed',
        }),
        status: 'failed',
        error: event.message,
      };

    case 'SETTLEMENT_STARTED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.verifyPosition, {
          status: 'confirming',
        }),
        status: 'busy',
        error: null,
      };

    case 'SETTLEMENT_CONFIRMED':
      return {
        ...state,
        steps: patchStep(
          patchStep(state.steps, STEP_ID.executeBatch, { status: 'confirmed' }),
          STEP_ID.verifyPosition,
          { status: 'confirmed' },
        ),
        currentIndex: state.steps.length,
        status: 'done',
        error: null,
      };

    case 'SETTLEMENT_FAILED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.verifyPosition, {
          status: 'failed',
        }),
        status: 'failed',
        error: event.message,
      };

    case 'RETRY': {
      const step = state.steps[state.currentIndex];
      if (!step) return { ...state, error: null };
      return {
        ...state,
        steps: patchStep(state.steps, step.id, { status: 'ready' }),
        status: 'ready',
        error: null,
      };
    }

    case 'RESET':
      return initialSingleChainDepositWizardState;

    default:
      return state;
  }
}

function copyRequest(
  request: SingleChainDepositRequest,
): SingleChainDepositRequest {
  if (request.kind === 'invest') {
    return {
      ...request,
      ...(request.split ? { split: { ...request.split } } : {}),
    };
  }
  return { ...request };
}

function assertSupportedRequest(request: SingleChainDepositRequest): void {
  if (request.kind === 'invest' && request.sourceChainId !== base.id) {
    throw new Error('Single-chain Morpho deposits must use Base.');
  }
}

function assertPlanChain(
  plan: DepositPlan,
  request: SingleChainDepositRequest,
): void {
  const chainId = requestChainId(request);
  if (plan.sourceChainId !== chainId) {
    throw new Error(
      `Deposit plan source chain ${plan.sourceChainId} does not match ${chainId}.`,
    );
  }
  const mismatchedTransaction = [...plan.approvals, ...plan.calls].find(
    (transaction) => transaction.chainId !== chainId,
  );
  if (mismatchedTransaction) {
    throw new Error('Single-chain deposit plan contains a cross-chain action.');
  }
}

/* jscpd:ignore-start -- single-chain and strategy wizards keep distinct wallet error context */
function assertPlannedAccount(
  activeAddress: string | undefined,
  plannedAddress: Address,
): void {
  if (!activeAddress) {
    throw new Error('Reconnect the wallet used to prepare this deposit plan.');
  }
  if (activeAddress.toLowerCase() !== plannedAddress.toLowerCase()) {
    throw new Error(
      'The connected wallet changed. Reconnect the wallet used to prepare this deposit plan.',
    );
  }
}
/* jscpd:ignore-end */

function transactionValue(plan: DepositPlan): bigint {
  return [...plan.approvals, ...plan.calls].reduce(
    (total, transaction) => total + BigInt(transaction.value),
    0n,
  );
}

async function assertSingleChainPreflight(params: {
  request: SingleChainDepositRequest;
  plan: DepositPlan;
  address: Address;
}): Promise<void> {
  const chainId = requestChainId(params.request);
  const publicClient = getPublicClient(chainId);
  const callsValue = transactionValue(params.plan);
  const fundingToken =
    params.request.kind === 'invest'
      ? (params.request.fromToken as Address)
      : GMX_V2_TOKENS.USDC.address;
  const fundingAmount = BigInt(
    params.request.kind === 'invest'
      ? params.request.fromAmount
      : params.request.amount,
  );
  const isNative =
    fundingToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

  if (isNative) {
    const required =
      (callsValue > fundingAmount ? callsValue : fundingAmount) +
      GAS_RESERVE_WEI;
    const balance = await publicClient.getBalance({ address: params.address });
    if (balance < required) {
      throw new Error(
        `Native balance too low on chain ${chainId}: need ${formatEther(required)} ETH including gas, have ${formatEther(balance)} ETH.`,
      );
    }
    return;
  }

  const [tokenBalance, nativeBalance] = await Promise.all([
    publicClient.readContract({
      address: fundingToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [params.address],
    }),
    publicClient.getBalance({ address: params.address }),
  ]);
  if (tokenBalance < fundingAmount) {
    throw new Error(
      `Funding balance too low on chain ${chainId}: need ${formatUnits(fundingAmount, 6)}, have ${formatUnits(tokenBalance, 6)}.`,
    );
  }
  if (nativeBalance < callsValue + GAS_RESERVE_WEI) {
    throw new Error(
      `ETH balance too low on chain ${chainId} for gas and protocol execution fees.`,
    );
  }
}

function positionToken(request: SingleChainDepositRequest): Address {
  return request.kind === 'invest'
    ? MORPHO_VAULTS[base.id].MOONWELL_USDC
    : GMX_V2_MARKETS[request.marketKey].marketToken;
}

async function readPositionBalance(
  request: SingleChainDepositRequest,
  address: Address,
): Promise<bigint> {
  return getPublicClient(requestChainId(request)).readContract({
    address: positionToken(request),
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

async function waitForPositionIncrease(params: {
  request: SingleChainDepositRequest;
  address: Address;
  baseline: bigint;
}): Promise<void> {
  await pollUntil({
    fn: () => readPositionBalance(params.request, params.address),
    shouldStop: (balance) => balance > params.baseline,
    intervalMs: 4_000,
    timeoutMs: params.request.kind === 'invest' ? 90_000 : 5 * 60_000,
  });
}

/**
 * Executes one single-chain protocol deposit as one wallet batch, then verifies
 * the resulting protocol position. `start` freezes and previews the exact
 * request. The first `advance` refreshes and submits it; the second only polls
 * settlement, so a submitted batch can never be duplicated by Retry.
 */
export function useSingleChainDepositWizard(): {
  wizard: SingleChainDepositWizardState;
  pending: boolean;
  start: (input: SingleChainDepositRequest) => Promise<void>;
  advance: () => Promise<void>;
  retry: () => void;
  reset: () => void;
} {
  const wallet = useWalletProvider();
  const [wizard, dispatch] = useReducer(
    singleChainDepositWizardReducer,
    initialSingleChainDepositWizardState,
  );
  const requestRef = useRef<SingleChainDepositRequest | null>(null);
  const planRef = useRef<DepositPlan | null>(null);
  const positionBaselineRef = useRef<bigint | null>(null);
  const batchSubmittedRef = useRef(false);
  const advanceInFlightRef = useRef(false);
  /* jscpd:ignore-start -- parallel wizard lifecycle refs are intentionally local to each state machine */
  const generationRef = useRef(0);
  const walletRef = useRef(wallet);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);
  /* jscpd:ignore-end */

  const start = useCallback(async (input: SingleChainDepositRequest) => {
    const request = copyRequest(input);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current = request;
    planRef.current = null;
    positionBaselineRef.current = null;
    batchSubmittedRef.current = false;
    advanceInFlightRef.current = false;
    dispatch({ type: 'PREPARE_STARTED', request });

    try {
      assertSupportedRequest(request);
      const plan = await getDepositPlan(request);
      assertPlanChain(plan, request);
      if (generation === generationRef.current) {
        planRef.current = plan;
        dispatch({ type: 'PLAN_LOADED', plan });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (generation === generationRef.current) {
        dispatch({
          type: 'PLAN_LOAD_FAILED',
          message: extractErrorMessage(error, 'Unable to prepare deposit plan'),
        });
      }
      throw error;
    }
  }, []);

  /* jscpd:ignore-start -- batch and settlement failures intentionally mirror async wizard error handling */
  const executeBatch = useCallback(
    async (request: SingleChainDepositRequest, generation: number) => {
      const address = request.userAddress as Address;
      const chainId = requestChainId(request);
      dispatch({ type: 'BATCH_STARTED' });

      try {
        assertPlannedAccount(walletRef.current.account?.address, address);
        const refreshedPlan = await getDepositPlan(request);
        assertPlanChain(refreshedPlan, request);
        if (generation !== generationRef.current) return;
        dispatch({ type: 'PLAN_REFRESHED', plan: refreshedPlan });

        assertPlannedAccount(walletRef.current.account?.address, address);
        if (walletRef.current.chain?.id !== chainId) {
          await walletRef.current.switchChain(chainId);
        }
        assertPlannedAccount(walletRef.current.account?.address, address);
        await assertSingleChainPreflight({
          request,
          plan: refreshedPlan,
          address,
        });
        positionBaselineRef.current = await readPositionBalance(
          request,
          address,
        );
        assertPlannedAccount(walletRef.current.account?.address, address);
        if (generation !== generationRef.current) return;

        const activeWallet = walletRef.current;
        const execution = await executeDepositPlanWithWallet({
          plan: refreshedPlan,
          chainId,
          getWalletClient: activeWallet.getWalletClient,
          ...(activeWallet.executeAtomicBatch
            ? { executeAtomicBatch: activeWallet.executeAtomicBatch }
            : {}),
          onBundleSubmitted: (callsId) => {
            batchSubmittedRef.current = true;
            if (generation === generationRef.current) {
              dispatch({ type: 'BATCH_SUBMITTED', callsId });
            }
          },
          onBundleConfirmed: (transactionHash) => {
            if (generation === generationRef.current) {
              dispatch({
                type: 'BATCH_CONFIRMED',
                ...(transactionHash ? { transactionHash } : {}),
              });
            }
          },
        });
        if (execution.kind === 'eip7702') {
          batchSubmittedRef.current = true;
        }
        if (generation !== generationRef.current) return;
        const transactionHash =
          execution.kind === 'eip7702'
            ? execution.transactionHash
            : execution.hashes.at(-1);
        dispatch({
          type: 'BATCH_COMPLETED',
          ...(execution.kind === 'eip7702'
            ? { callsId: execution.callsId }
            : {}),
          ...(transactionHash ? { transactionHash } : {}),
        });
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({
            type: 'BATCH_FAILED',
            message: extractErrorMessage(error, 'Deposit batch failed'),
            submitted: batchSubmittedRef.current,
          });
        }
      }
    },
    [],
  );

  const verifySettlement = useCallback(
    async (request: SingleChainDepositRequest, generation: number) => {
      dispatch({ type: 'SETTLEMENT_STARTED' });
      try {
        const address = request.userAddress as Address;
        assertPlannedAccount(walletRef.current.account?.address, address);
        const baseline = positionBaselineRef.current;
        if (baseline === null) {
          throw new Error('Position baseline is unavailable.');
        }
        await waitForPositionIncrease({ request, address, baseline });
        if (generation === generationRef.current) {
          dispatch({ type: 'SETTLEMENT_CONFIRMED' });
        }
      } catch (error) {
        if (generation === generationRef.current) {
          dispatch({
            type: 'SETTLEMENT_FAILED',
            message: extractErrorMessage(
              error,
              'Unable to verify protocol settlement',
            ),
          });
        }
      }
    },
    [],
  );
  /* jscpd:ignore-end */

  const advance = useCallback(async () => {
    const request = requestRef.current;
    const currentIndex =
      wizard.currentIndex === 0 && planRef.current !== null
        ? 1
        : wizard.currentIndex;
    const stepKind =
      wizard.steps[currentIndex]?.kind ??
      (planRef.current !== null ? ('batch' as const) : undefined);
    if (
      !request ||
      !stepKind ||
      wizard.status === 'busy' ||
      advanceInFlightRef.current
    ) {
      return;
    }

    const generation = generationRef.current;
    advanceInFlightRef.current = true;
    try {
      if (stepKind === 'batch') {
        await executeBatch(request, generation);
      } else if (stepKind === 'settlement') {
        await verifySettlement(request, generation);
      }
    } finally {
      advanceInFlightRef.current = false;
    }
  }, [executeBatch, verifySettlement, wizard]);

  const retry = useCallback(() => dispatch({ type: 'RETRY' }), []);

  /* jscpd:ignore-start -- reset invalidates single-chain-only refs before dispatching its own reducer action */
  const reset = useCallback(() => {
    generationRef.current += 1;
    requestRef.current = null;
    planRef.current = null;
    positionBaselineRef.current = null;
    batchSubmittedRef.current = false;
    advanceInFlightRef.current = false;
    dispatch({ type: 'RESET' });
  }, []);
  /* jscpd:ignore-end */

  return {
    wizard,
    pending: wizard.status === 'busy',
    start,
    advance,
    retry,
    reset,
  };
}
