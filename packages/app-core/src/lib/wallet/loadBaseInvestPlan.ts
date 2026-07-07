import {
  ensureChain,
  requireUserAddress,
} from '@core/hooks/useDepositExecutionState';
import { getDepositPlan } from '@core/services/planOrchestrationService';
import type { DepositPlan } from '@zapengine/types/api';
import type { Address } from 'viem';
import { base } from 'viem/chains';

export interface InvestWalletContext {
  account: { address: string } | null | undefined;
  chain: { id: number } | null | undefined;
  switchChain: (chainId: number) => Promise<void>;
}

/**
 * Shared preamble for Base-source invest flows: resolve the connected
 * address, make sure the wallet sits on Base, and fetch the authoritative
 * plan from plan-orchestration.
 */
export async function loadBaseInvestPlan(
  wallet: InvestWalletContext,
  input: { fromToken: Address; fromAmount: string },
): Promise<{ userAddress: Address; plan: DepositPlan }> {
  const userAddress = requireUserAddress(wallet.account?.address);
  await ensureChain(wallet.chain?.id, base.id, wallet.switchChain);

  const plan = await getDepositPlan({
    kind: 'invest',
    userAddress,
    fromToken: input.fromToken,
    fromAmount: input.fromAmount,
    sourceChainId: base.id,
  });

  return { userAddress, plan };
}
