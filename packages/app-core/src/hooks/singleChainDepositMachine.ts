import type {
  DepositPlan,
  PlanOrchestrationDepositRequest,
} from '@zapengine/types/api';
import type { Hash } from 'viem';
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

export type SingleChainDepositRecovery = 'wallet-delegation' | null;

export interface SingleChainDepositWizardState {
  plan: DepositPlan | null;
  steps: SingleChainDepositWizardStep[];
  currentIndex: number;
  status: 'idle' | 'ready' | 'busy' | 'done' | 'failed';
  error: string | null;
  recovery: SingleChainDepositRecovery;
}

export type SingleChainDepositWizardEvent =
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
  | {
      type: 'BATCH_FAILED';
      message: string;
      submitted: boolean;
      recovery: SingleChainDepositRecovery;
    }
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
    recovery: null,
  };

export function requestChainId(request: SingleChainDepositRequest): number {
  return request.kind === 'invest' ? request.sourceChainId : arbitrum.id;
}

function requestProtocolLabel(request: SingleChainDepositRequest): string {
  if (request.kind === 'invest') return 'Morpho Moonwell';
  if (request.kind === 'gmx-v2-basket') return 'GMX BTC 2-pool basket';
  return `GMX ${request.marketKey.toUpperCase().replace('-', '/')}`;
}

function createSteps(
  request: SingleChainDepositRequest,
): SingleChainDepositWizardStep[] {
  const chainId = requestChainId(request);
  const chainName = chainId === base.id ? 'Base' : 'Arbitrum';
  const protocol = requestProtocolLabel(request);

  return [
    {
      id: STEP_ID.preparePlan,
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
          : request.kind === 'gmx-v2-basket'
            ? 'Wait for both GMX market-token balances to increase.'
            : 'Wait for the GMX market-token balance to increase.',
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
        recovery: null,
      };

    case 'PLAN_LOADED':
      return {
        ...state,
        plan: event.plan,
        steps: patchStep(
          patchStep(state.steps, STEP_ID.preparePlan, { status: 'confirmed' }),
          STEP_ID.executeBatch,
          { status: 'ready' },
        ),
        currentIndex: 1,
        status: 'ready',
        error: null,
        recovery: null,
      };

    case 'PLAN_LOAD_FAILED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.preparePlan, {
          status: 'failed',
        }),
        status: 'failed',
        error: event.message,
        recovery: null,
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
        recovery: null,
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
        recovery: null,
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
          recovery: null,
        };
      }
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.executeBatch, {
          status: 'failed',
        }),
        status: 'failed',
        error: event.message,
        recovery: event.recovery,
      };

    case 'SETTLEMENT_STARTED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.verifyPosition, {
          status: 'confirming',
        }),
        status: 'busy',
        error: null,
        recovery: null,
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
        recovery: null,
      };

    case 'SETTLEMENT_FAILED':
      return {
        ...state,
        steps: patchStep(state.steps, STEP_ID.verifyPosition, {
          status: 'failed',
        }),
        status: 'failed',
        error: event.message,
        recovery: null,
      };

    case 'RETRY': {
      const step = state.steps[state.currentIndex];
      if (!step) return { ...state, error: null, recovery: null };
      return {
        ...state,
        steps: patchStep(state.steps, step.id, { status: 'ready' }),
        status: 'ready',
        error: null,
        recovery: null,
      };
    }

    case 'RESET':
      return initialSingleChainDepositWizardState;
  }
}
