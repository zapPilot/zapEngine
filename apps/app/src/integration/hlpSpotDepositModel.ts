import type { HyperliquidAgentSessionStatus } from '@zapengine/app-core/hooks/useHyperliquidAgentSession';
import type { WizardHlpStatus } from '@zapengine/app-core/lib/wallet/depositWizardMachine';

export function hlpSpotDone(status: WizardHlpStatus): boolean {
  return status === 'deposited' || status === 'submittedUnverified';
}

export function hlpSpotSignatureLabel(
  agentStatus: HyperliquidAgentSessionStatus,
): string {
  return agentStatus === 'ready'
    ? 'None — signing enabled'
    : '1 — enable Hyperliquid signing';
}

export function hlpSpotDepositCta(input: {
  planLoading: boolean;
  wizardStatus: WizardHlpStatus;
  agentStatus: HyperliquidAgentSessionStatus;
}): string {
  if (input.planLoading) return 'Preparing deposit…';
  if (input.agentStatus === 'checking') return 'Checking Hyperliquid signing…';
  if (input.agentStatus === 'approving') return 'Confirm in your wallet…';
  if (input.agentStatus !== 'ready') return 'Enable Hyperliquid signing';
  if (input.wizardStatus === 'confirming') return 'Confirming deposit…';
  return 'Deposit into HLP vault';
}
