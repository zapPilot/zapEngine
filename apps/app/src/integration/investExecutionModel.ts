import {
  getExplorerAddressUrl,
  getExplorerTxUrl,
} from '@zapengine/app-core/config/chains/display';
import type { StartDepositWizardInput } from '@zapengine/app-core/hooks/useDepositWizard';
import type {
  WizardHlpState,
  WizardHlpStatus,
  WizardLegProgress,
  WizardLegStatus,
} from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { formatUsd6 } from '@zapengine/app-core/lib/wallet/usd6';

import {
  type DesktopDepositPath,
  isGmxDepositPath,
} from '@/integration/depositPaths';
import { chainDisplay } from '@/integration/planPreviewFormatters';

/** Why the confirm CTA can or cannot hand off to the deposit wizard. */
export type DepositExecutionCapability =
  | 'ready'
  | 'connect-wallet'
  | 'unsupported-wallet'
  | 'unsupported-path';

export function resolveDepositExecutionCapability({
  isConnected,
  executionMode,
  depositPath,
}: {
  isConnected: boolean;
  /** `WalletProviderInterface.executionMode` — `undefined` on native (Privy-Expo has no execution path yet). */
  executionMode: 'atomic-batch' | 'eip7702' | undefined;
  depositPath: DesktopDepositPath;
}): DepositExecutionCapability {
  if (isGmxDepositPath(depositPath)) {
    return 'unsupported-path';
  }
  if (!isConnected) {
    return 'connect-wallet';
  }
  if (executionMode === undefined) {
    return 'unsupported-wallet';
  }
  return 'ready';
}

/**
 * Maps the invest draft onto the wizard's start input. Returns null when the
 * draft cannot be executed by the wizard (GMX path, empty amount) so callers
 * can gate instead of firing a doomed request.
 */
export function buildWizardStartInput(draft: {
  depositPath: DesktopDepositPath;
  fromToken: `0x${string}`;
  fromAmount: string;
}): StartDepositWizardInput | null {
  if (isGmxDepositPath(draft.depositPath)) {
    return null;
  }
  if (!draft.fromAmount || draft.fromAmount === '0') {
    return null;
  }
  return { fromToken: draft.fromToken, fromAmount: draft.fromAmount };
}

export type WizardLegTone = 'neutral' | 'success' | 'error';

export interface WizardLegRow {
  id: string;
  title: string;
  chainLabel: string;
  dotColor: string;
  statusLabel: string;
  statusTone: WizardLegTone;
  sourceTxUrl: string | null;
  destinationTxUrl: string | null;
}

const LEG_STATUS_LABELS: Record<
  WizardLegStatus,
  { label: string; tone: WizardLegTone }
> = {
  pending: { label: 'Pending', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'neutral' },
  sourceConfirmed: { label: 'Confirmed on source', tone: 'neutral' },
  bridgePending: { label: 'Bridging…', tone: 'neutral' },
  destinationConfirmed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
};

export function wizardLegRows(
  legs: WizardLegProgress[],
  sourceChainId: number,
): WizardLegRow[] {
  return legs.map((leg, index) => {
    const chain = chainDisplay(leg.chainId);
    const status = LEG_STATUS_LABELS[leg.status];
    const action =
      leg.kind === 'bridge'
        ? `Bridge to ${chain.label}`
        : `Deposit on ${chain.label}`;

    return {
      id: `${leg.kind}-${leg.chainId}-${index}`,
      title: leg.protocol ? `${action} · ${leg.protocol}` : action,
      chainLabel: chain.label,
      dotColor: chain.color,
      statusLabel: status.label,
      statusTone: status.tone,
      sourceTxUrl: leg.sourceTxHash
        ? getExplorerTxUrl(sourceChainId, leg.sourceTxHash)
        : null,
      destinationTxUrl: leg.destinationTxHash
        ? getExplorerTxUrl(leg.chainId, leg.destinationTxHash)
        : null,
    };
  });
}

export const HLP_STATUS_COPY: Record<WizardHlpStatus, string> = {
  idle: 'Waiting for the bridge…',
  awaitingArrival: 'Waiting for USDC to arrive on Hyperliquid…',
  arrived: 'Funds arrived — ready to deposit into HLP.',
  confirming: 'Confirming your HLP deposit…',
  deposited: 'Deposited into HLP.',
};

export function canSubmitHlpDeposit(
  status: WizardHlpStatus,
  lockAccepted: boolean,
): boolean {
  return status === 'arrived' && lockAccepted;
}

export interface HlpAmountRow {
  label: string;
  value: string;
}

export function hlpAmountRows(hlp: WizardHlpState): HlpAmountRow[] {
  const rows: HlpAmountRow[] = [];
  if (hlp.step) {
    rows.push({
      label: 'Expected',
      value: `${formatUsd6(BigInt(hlp.step.expectedUsd))} USDC`,
    });
  }
  if (hlp.arrivedUsd6 !== null) {
    rows.push({
      label: 'Arrived',
      value: `${formatUsd6(hlp.arrivedUsd6)} USDC`,
    });
  }
  if (hlp.vaultEquityUsd6 !== null) {
    rows.push({
      label: 'Vault equity',
      value: `${formatUsd6(hlp.vaultEquityUsd6)} USDC`,
    });
  }
  return rows;
}

export function hyperliquidAccountUrl(
  hlp: WizardHlpState,
  userAddress: string | null,
): string | null {
  if (!hlp.step || !userAddress) {
    return null;
  }
  return getExplorerAddressUrl(hlp.step.chainId, userAddress);
}
