import type {
  DepositPlan,
  HyperliquidVaultDepositStep,
} from '@zapengine/types/api';
import type { Hash } from 'viem';

/**
 * Pure state machine behind the deposit wizard (step 1/2/3/4 UX). No React,
 * no I/O — the useDepositWizard hook owns side effects and feeds events in.
 * v1 stages cover Base source execution → bridge watching → HLP deposit;
 * destination-chain EVM supplies (`destination-replan` follow-ups) get their
 * own stage when a destination vault ships.
 */
export type WizardStage =
  | 'configure'
  | 'sourceExecution'
  | 'bridging'
  | 'hyperliquidDeposit'
  | 'done';

export type WizardLegStatus =
  | 'pending'
  | 'submitted'
  | 'sourceConfirmed'
  | 'bridgePending'
  | 'destinationConfirmed'
  | 'failed';

export interface WizardLegProgress {
  chainId: number;
  kind: 'supply' | 'bridge';
  protocol?: string;
  status: WizardLegStatus;
  sourceTxHash?: Hash;
  destinationTxHash?: Hash;
}

export type WizardHlpStatus =
  | 'idle'
  | 'awaitingArrival'
  | 'arrived'
  | 'confirming'
  | 'deposited';

export interface WizardHlpState {
  status: WizardHlpStatus;
  step: HyperliquidVaultDepositStep | null;
  baselineUsd6: bigint | null;
  arrivedUsd6: bigint | null;
  vaultEquityUsd6: bigint | null;
}

export interface DepositWizardState {
  stage: WizardStage;
  plan: DepositPlan | null;
  legs: WizardLegProgress[];
  hlp: WizardHlpState;
  error: { stage: WizardStage; message: string } | null;
}

export type DepositWizardEvent =
  | { type: 'RESET' }
  | { type: 'PLAN_LOADED'; plan: DepositPlan; baselineUsd6?: bigint }
  | { type: 'SOURCE_SUBMITTED' }
  | { type: 'SOURCE_CONFIRMED'; transactionHash?: Hash }
  | {
      type: 'BRIDGE_UPDATE';
      legIndex: number;
      status: WizardLegStatus;
      sourceTxHash?: Hash;
      destinationTxHash?: Hash;
    }
  | { type: 'HL_ARRIVED'; arrivedUsd6: bigint }
  | { type: 'HL_SUBMITTED' }
  | { type: 'HL_CONFIRMED'; vaultEquityUsd6: bigint }
  | { type: 'STAGE_FAILED'; stage: WizardStage; message: string }
  | { type: 'RETRY' };

const initialHlpState: WizardHlpState = {
  status: 'idle',
  step: null,
  baselineUsd6: null,
  arrivedUsd6: null,
  vaultEquityUsd6: null,
};

export const initialDepositWizardState: DepositWizardState = {
  stage: 'configure',
  plan: null,
  legs: [],
  hlp: initialHlpState,
  error: null,
};

export function hlpStepFromPlan(
  plan: DepositPlan,
): HyperliquidVaultDepositStep | null {
  return (
    plan.followUps?.find(
      (followUp): followUp is HyperliquidVaultDepositStep =>
        followUp.kind === 'hyperliquid-vault-deposit',
    ) ?? null
  );
}

function legsFromPlan(plan: DepositPlan): WizardLegProgress[] {
  return plan.legs.map((leg) => ({
    chainId: leg.chainId,
    kind: leg.kind,
    ...(leg.protocol ? { protocol: leg.protocol } : {}),
    status: 'pending' as const,
  }));
}

function withLegPatch(
  legs: WizardLegProgress[],
  legIndex: number,
  patch: Partial<WizardLegProgress>,
): WizardLegProgress[] {
  return legs.map((leg, index) =>
    index === legIndex ? { ...leg, ...patch } : leg,
  );
}

function allBridgeLegsTerminal(legs: WizardLegProgress[]): boolean {
  return legs
    .filter((leg) => leg.kind === 'bridge')
    .every(
      (leg) => leg.status === 'destinationConfirmed' || leg.status === 'failed',
    );
}

function anyBridgeLegFailed(legs: WizardLegProgress[]): boolean {
  return legs.some((leg) => leg.kind === 'bridge' && leg.status === 'failed');
}

function afterBridgingStage(state: DepositWizardState): DepositWizardState {
  if (!allBridgeLegsTerminal(state.legs)) {
    return state;
  }
  if (anyBridgeLegFailed(state.legs)) {
    return {
      ...state,
      error: {
        stage: 'bridging',
        message: 'A bridge transfer failed — funds stayed on the source side.',
      },
    };
  }
  if (state.hlp.step) {
    return {
      ...state,
      stage: 'hyperliquidDeposit',
      hlp: { ...state.hlp, status: 'awaitingArrival' },
    };
  }
  return { ...state, stage: 'done' };
}

export function depositWizardReducer(
  state: DepositWizardState,
  event: DepositWizardEvent,
): DepositWizardState {
  switch (event.type) {
    case 'RESET':
      return initialDepositWizardState;

    case 'PLAN_LOADED': {
      const step = hlpStepFromPlan(event.plan);
      return {
        ...initialDepositWizardState,
        stage: 'sourceExecution',
        plan: event.plan,
        legs: legsFromPlan(event.plan),
        hlp: {
          ...initialHlpState,
          step,
          baselineUsd6: event.baselineUsd6 ?? null,
        },
      };
    }

    case 'SOURCE_SUBMITTED':
      return {
        ...state,
        legs: state.legs.map((leg) => ({ ...leg, status: 'submitted' })),
      };

    case 'SOURCE_CONFIRMED': {
      const legs = state.legs.map(
        (leg): WizardLegProgress => ({
          ...leg,
          status: 'sourceConfirmed',
          ...(event.transactionHash
            ? { sourceTxHash: event.transactionHash }
            : {}),
        }),
      );
      const hasBridgeLeg = legs.some((leg) => leg.kind === 'bridge');
      if (hasBridgeLeg) {
        return { ...state, stage: 'bridging', legs };
      }
      return afterBridgingStage({ ...state, legs });
    }

    case 'BRIDGE_UPDATE': {
      const legs = withLegPatch(state.legs, event.legIndex, {
        status: event.status,
        ...(event.sourceTxHash ? { sourceTxHash: event.sourceTxHash } : {}),
        ...(event.destinationTxHash
          ? { destinationTxHash: event.destinationTxHash }
          : {}),
      });
      return afterBridgingStage({ ...state, legs });
    }

    case 'HL_ARRIVED':
      return {
        ...state,
        hlp: {
          ...state.hlp,
          status: 'arrived',
          arrivedUsd6: event.arrivedUsd6,
        },
      };

    case 'HL_SUBMITTED':
      return { ...state, hlp: { ...state.hlp, status: 'confirming' } };

    case 'HL_CONFIRMED':
      return {
        ...state,
        stage: 'done',
        hlp: {
          ...state.hlp,
          status: 'deposited',
          vaultEquityUsd6: event.vaultEquityUsd6,
        },
      };

    case 'STAGE_FAILED':
      return {
        ...state,
        error: { stage: event.stage, message: event.message },
      };

    case 'RETRY':
      return { ...state, error: null };

    default:
      return state;
  }
}

/**
 * Resolve the vaultTransfer amount for the HLP step: the actually-received
 * perp USDC for `bridge-output`, or the plan-fixed amount. Enforces the vault
 * minimum from the plan payload.
 */
export function resolveHlpDepositUsd6(
  step: HyperliquidVaultDepositStep,
  arrivedUsd6: bigint | null,
): bigint {
  const usd6 =
    step.amount.source === 'bridge-output'
      ? arrivedUsd6
      : BigInt(step.amount.amount);

  if (usd6 === null) {
    throw new Error('HLP deposit amount is not known yet (funds not arrived)');
  }
  if (usd6 < BigInt(step.minDepositUsd)) {
    throw new Error(
      `HLP deposit of ${usd6} is below the vault minimum of ${step.minDepositUsd}`,
    );
  }
  return usd6;
}
