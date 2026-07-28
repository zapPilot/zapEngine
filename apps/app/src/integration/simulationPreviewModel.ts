import type { PrivyBatchExecutionPhase } from '@zapengine/app-core/hooks/wallet/useAtomicBatchExecution';
import type {
  PrivyPrepareSendCallsResponse,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationCall,
  PrivySimulationContract,
} from '@zapengine/types/api';

export const PREVIEW_EXPIRY_MARGIN_MS = 10_000;

export type SimulationVerdictTone = 'success' | 'warning' | 'error' | 'neutral';

export interface SimulationVerdictMeta {
  label: string;
  tone: SimulationVerdictTone;
}

export type ConfirmGateReason =
  | 'simulation-blocked'
  | 'preview-expired'
  | 'busy'
  | 'warning-acknowledgement-required';

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
    case 'warning': {
      if (typeof previewOrStatus === 'string') {
        return { label: 'Review warnings', tone: 'warning' };
      }
      const count = previewOrStatus.warnings.length;
      return {
        label: `Review ${count} ${count === 1 ? 'warning' : 'warnings'}`,
        tone: 'warning',
      };
    }
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

function verifiedContractName(
  address: string,
  contracts: readonly PrivySimulationContract[],
): string | null {
  const contract = contracts.find(
    (candidate) =>
      candidate.verified &&
      candidate.name !== null &&
      candidate.address.toLowerCase() === address.toLowerCase(),
  );
  return contract?.name ?? null;
}

/**
 * Uses a verified Tenderly contract name when one is available. Unverified
 * names are deliberately not elevated above the raw address.
 */
export function resolveCallTarget(
  call: Pick<PrivySimulationCall, 'to'>,
  contracts: readonly PrivySimulationContract[],
): string {
  return verifiedContractName(call.to, contracts) ?? formatAddress(call.to);
}

export function resolveAddressTarget(
  address: string,
  contracts: readonly PrivySimulationContract[],
): string {
  return verifiedContractName(address, contracts) ?? formatAddress(address);
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
    warningAcknowledged,
  }: {
    nowMs: number;
    busy: boolean;
    warningAcknowledged: boolean;
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
  if (preview.status === 'warning' && !warningAcknowledged) {
    return {
      canConfirm: false,
      expired: false,
      reason: 'warning-acknowledgement-required',
    };
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

export function formatAddress(address: string | null | undefined): string {
  if (!address) return 'Unknown';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Formats a raw integer token amount without floating-point conversion. */
export function formatTokenAmount(rawAmount: string, decimals: number): string {
  const negative = rawAmount.startsWith('-');
  const digits = negative ? rawAmount.slice(1) : rawAmount;
  const padded = digits.padStart(decimals + 1, '0');
  const integer = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fractionRaw = decimals === 0 ? '' : padded.slice(-decimals);
  const fraction = fractionRaw.replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Keeps six meaningful decimal places for review rows while preserving tiny
 * values that would otherwise appear as zero.
 */
export function compactTokenAmount(
  rawAmount: string,
  decimals: number,
): string {
  const exact = formatTokenAmount(rawAmount, decimals);
  const negative = exact.startsWith('-');
  const unsigned = negative ? exact.slice(1) : exact;
  const [integer = '0', fraction] = unsigned.split('.');
  if (!fraction) return exact;

  const firstSignificant = fraction.search(/[1-9]/);
  const visibleFractionLength =
    integer === '0' && firstSignificant >= 0 ? firstSignificant + 6 : 6;
  const visibleFraction = fraction
    .slice(0, visibleFractionLength)
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${
    visibleFraction ? `.${visibleFraction}` : ''
  }`;
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
  if (chainId === 8453) return 'Base';
  if (chainId === 42161) return 'Arbitrum';
  return `Chain ${chainId}`;
}
