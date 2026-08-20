import type { PrivyBatchExecutionPhase } from '@zapengine/app-core/hooks/wallet/useAtomicBatchExecution';
import {
  formatAddress as formatWalletAddress,
  formatCompactTokenAmount,
} from '@zapengine/app-core/utils';
import {
  CHAIN_BRAND,
  type ChainBrandKey,
  chainBrandKeyForChainId,
} from '@zapengine/brand-assets';
import type {
  PlanOrchestrationDepositPlan,
  PrivyPrepareSendCallsResponse,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationCall,
  PrivySimulationContract,
  StrategyAllocation,
  StrategyDepositPlan,
} from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';

export const PREVIEW_EXPIRY_MARGIN_MS = 10_000;

export type SimulationVerdictTone = 'success' | 'error' | 'neutral';

export interface SimulationVerdictMeta {
  label: string;
  tone: SimulationVerdictTone;
}

export type ConfirmGateReason =
  | 'simulation-blocked'
  | 'preview-expired'
  | 'busy';

export interface SimulationConfirmGate {
  canConfirm: boolean;
  expired: boolean;
  reason: ConfirmGateReason | null;
}

type PreviewStatus = PrivyPrepareSendCallsResponse['status'];
type PreviewOrStatus = PrivyPrepareSendCallsResponse | PreviewStatus;

function previewStatus(value: PreviewOrStatus): PreviewStatus {
  return typeof value === 'string' ? value : value.status;
}

/**
 * Reader-facing simulation verdict metadata. Warning copy includes the count
 * when the complete preview is available, while status-only callers get a
 * stable label.
 */
export function verdictMeta(
  previewOrStatus: PreviewOrStatus,
): SimulationVerdictMeta {
  const status = previewStatus(previewOrStatus);
  switch (status) {
    case 'passed':
      return { label: 'All checks passed', tone: 'success' };
    case 'warning':
      return { label: 'Simulation ready', tone: 'success' };
    case 'failed':
      return { label: 'Simulation failed', tone: 'error' };
    case 'unavailable':
      return { label: 'Simulation unavailable', tone: 'neutral' };
  }
}

export function getBlockingReason(
  preview: PrivyPrepareSendCallsResponse,
): string | null {
  if (preview.status === 'failed') return preview.failureReason;
  if (preview.status === 'unavailable') return preview.unavailableReason;
  return null;
}

export function partitionAssetChanges(
  changes: readonly PrivySimulationAssetChange[],
): {
  incoming: PrivySimulationAssetChange[];
  outgoing: PrivySimulationAssetChange[];
} {
  const incoming: PrivySimulationAssetChange[] = [];
  const outgoing: PrivySimulationAssetChange[] = [];
  for (const change of changes) {
    if (change.direction === 'in') {
      incoming.push(change);
    } else {
      outgoing.push(change);
    }
  }
  return { incoming, outgoing };
}

function contractName(
  address: string,
  contracts: readonly PrivySimulationContract[],
): string | null {
  const contract = contracts.find(
    (candidate) =>
      candidate.name !== null && equalsAddress(candidate.address, address),
  );
  return contract?.name ?? null;
}

/**
 * Uses the review's contract name when one is available. A name only ever
 * comes from the target's own on-chain `name()` or from our protocol registry,
 * never from a self-reported label, so it is trustworthy on its own.
 */
export function resolveCallTarget(
  call: Pick<PrivySimulationCall, 'to'>,
  contracts: readonly PrivySimulationContract[],
): string {
  return contractName(call.to, contracts) ?? formatAddressOrUnknown(call.to);
}

export function resolveAddressTarget(
  address: string,
  contracts: readonly PrivySimulationContract[],
): string {
  return contractName(address, contracts) ?? formatAddressOrUnknown(address);
}

/**
 * Resolves the human-facing counterparty for one asset movement: the
 * recipient for an outgoing transfer, the sender for an incoming one.
 */
export function resolveAssetCounterparty(
  change: Pick<PrivySimulationAssetChange, 'direction' | 'from' | 'to'>,
  contracts: readonly PrivySimulationContract[],
): string {
  const address = change.direction === 'out' ? change.to : change.from;
  return address ? resolveAddressTarget(address, contracts) : 'Unknown';
}

export interface RouteProtocolContext {
  id: string;
  /** Raw protocol id, resolved to a venue mark by `ProtocolIcon`. */
  protocol: string;
  label: string;
  badge: string;
}

/** Display label for a single-chain plan's lone protocol when its legs carry
 * no more specific server-provided label (e.g. a plain Morpho supply). */
const SINGLE_CHAIN_PROTOCOL_LABELS: Record<string, string> = {
  morpho: 'Morpho Moonwell USDC',
};

/** A plan orchestration response is the multi-chain strategy shape when it
 * carries execution groups; a single-chain `DepositPlan` never does. */
export function isStrategyDepositPlan(
  plan: PlanOrchestrationDepositPlan | undefined,
): plan is StrategyDepositPlan {
  return Boolean(plan && 'executionGroups' in plan);
}

/** Formats a numerator/denominator base-unit ratio as a percent with at most
 * one decimal place, e.g. 2501/10000 -> "25.0%", 3333/10000 -> "33.3%". */
function formatSharePercent(numerator: bigint, denominator: bigint): string {
  if (denominator <= 0n) return '0%';
  const tenths = (numerator * 1000n) / denominator;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction}%`;
}

/**
 * Builds the protocol/allocation chips for one chain review group. A single
 * EIP-7702 bundle can move funds through more than one protocol allocation
 * (e.g. the Arbitrum leg supplies both GMX BTC/USDC and ETH/USDC), so each
 * allocation gets its own chip rather than being collapsed into one label.
 */
export function resolveRouteProtocols(
  plan: PlanOrchestrationDepositPlan | undefined,
  groupId: string,
): RouteProtocolContext[] {
  if (isStrategyDepositPlan(plan)) {
    const group = plan.executionGroups.find(
      (candidate) => candidate.id === groupId,
    );
    if (!group) return [];
    return group.allocationIds
      .map((allocationId) =>
        plan.allocations.find((allocation) => allocation.id === allocationId),
      )
      .filter((allocation): allocation is StrategyAllocation =>
        Boolean(allocation),
      )
      .map((allocation) => ({
        id: allocation.id,
        protocol: allocation.protocol,
        label: allocation.label,
        badge: `${allocation.weightBps / 100}%`,
      }));
  }
  const legs = (plan?.legs ?? []).filter(
    (leg): leg is typeof leg & { protocol: string } => Boolean(leg.protocol),
  );
  if (legs.length === 0) return [];
  const totalFromAmount = legs.reduce(
    (sum, leg) => sum + BigInt(leg.fromAmount),
    0n,
  );
  return legs.map((leg, index) => ({
    id: `${leg.protocol}-${leg.toToken.toLowerCase()}-${index}`,
    protocol: leg.protocol,
    label:
      leg.label ??
      SINGLE_CHAIN_PROTOCOL_LABELS[leg.protocol] ??
      titleCase(leg.protocol),
    badge: formatSharePercent(BigInt(leg.fromAmount), totalFromAmount),
  }));
}

export function approvalForCall(
  call: Pick<PrivySimulationCall, 'index'> | number,
  approvals: readonly PrivySimulationApproval[],
): PrivySimulationApproval | undefined {
  const callIndex = typeof call === 'number' ? call : call.index;
  return approvals.find((approval) => approval.callIndex === callIndex);
}

/**
 * The server expiry is an epoch timestamp in milliseconds. Stop offering a
 * signature ten seconds early so a preview does not expire mid-signature.
 */
export function confirmGate(
  preview: PrivyPrepareSendCallsResponse,
  {
    nowMs,
    busy,
  }: {
    nowMs: number;
    busy: boolean;
  },
): SimulationConfirmGate {
  if (preview.status === 'failed' || preview.status === 'unavailable') {
    return {
      canConfirm: false,
      expired: false,
      reason: 'simulation-blocked',
    };
  }

  const expired = preview.expiresAt - nowMs <= PREVIEW_EXPIRY_MARGIN_MS;
  if (expired) {
    return { canConfirm: false, expired: true, reason: 'preview-expired' };
  }
  if (busy) {
    return { canConfirm: false, expired: false, reason: 'busy' };
  }
  return { canConfirm: true, expired: false, reason: null };
}

export function signingActionLabel(phase: PrivyBatchExecutionPhase): string {
  switch (phase) {
    case 'idle':
      return 'Sign & Send';
    case 'signingIntent':
      return 'Signing intent…';
    case 'authorizingBatch':
      return 'Authorizing batch…';
    case 'sendingBatch':
      return 'Sending batch…';
  }
}

export function confirmRiskHash(
  preview: PrivyPrepareSendCallsResponse,
): string | undefined {
  return preview.status === 'warning' ? preview.riskHash : undefined;
}

export function formatAddressOrUnknown(
  address: string | null | undefined,
): string {
  return formatWalletAddress(address) || 'Unknown';
}

/**
 * Keeps six meaningful decimal places for review rows while preserving tiny
 * values that would otherwise appear as zero.
 */
export function compactTokenAmount(
  rawAmount: string,
  decimals: number,
): string {
  return formatCompactTokenAmount(rawAmount, decimals);
}

export function formatInteger(value: string | number | null): string {
  if (value === null) return 'Unavailable';
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return String(value);
  }
}

/**
 * Formats the millisecond expiry countdown. The safety margin is optional so
 * callers can render the same "Expired" boundary used by the confirm gate.
 */
export function formatCountdown(
  expiresAtMs: number,
  nowMs: number,
  marginMs = PREVIEW_EXPIRY_MARGIN_MS,
): string {
  const remainingMs = expiresAtMs - nowMs - marginMs;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds === 0) return 'Expired';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function titleCase(value: string | null): string {
  if (!value) return 'Contract call';
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function simulationChainLabel(chainId: number): string {
  const chainKey = chainBrandKeyForChainId(chainId);
  return chainKey ? CHAIN_BRAND[chainKey].label : `Chain ${chainId}`;
}

/** Undefined for a chain with no registered mark; render the label alone. */
export function simulationChainKey(chainId: number): ChainBrandKey | undefined {
  return chainBrandKeyForChainId(chainId);
}
