import { getExplorerAddressUrl } from '@zapengine/app-core/config/chains/display';
import type { WizardHlpState } from '@zapengine/app-core/lib/wallet/depositWizardMachine';

import type { InvestScope } from '@/integration/investAmountModel';

/** Why the confirm CTA can or cannot execute the reviewed deposit. */
export type DepositExecutionCapability =
  | 'ready'
  | 'connect-wallet'
  | 'unsupported-wallet';

export function resolveDepositExecutionCapability({
  isConnected,
  executionMode,
}: {
  isConnected: boolean;
  /** `WalletProviderInterface.executionMode`; undefined when the active backend cannot execute a deposit plan. */
  executionMode: 'atomic-batch' | 'eip7702' | undefined;
}): DepositExecutionCapability {
  if (!isConnected) {
    return 'connect-wallet';
  }
  if (executionMode === undefined) {
    return 'unsupported-wallet';
  }
  return 'ready';
}

export function resolveInvestExecutionCapability({
  isConnected,
  executionMode,
}: {
  isConnected: boolean;
  executionMode: 'atomic-batch' | 'eip7702' | undefined;
  scope: InvestScope;
}): DepositExecutionCapability {
  if (!isConnected) {
    return 'connect-wallet';
  }
  // The unified review always submits one atomic group. Both-chain plans must
  // never fall back to sequential wallet sends, so every scope needs a
  // reviewed-capable execution backend.
  if (executionMode === undefined) {
    return 'unsupported-wallet';
  }
  return 'ready';
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
