import { useQuery } from '@tanstack/react-query';
import { hlpSpendableShortfallUsd6 } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type { HyperCoreAccountMode } from '@zapengine/app-core/services/hyperliquidService';
import { getHlpSpotDepositPlan } from '@zapengine/app-core/services/planOrchestrationService';
import type { HlpSpotDepositPlan } from '@zapengine/types/api';

import { hlpSpendableUsd6 } from '@/integration/hyperliquidPanelModel';
import { useAccount } from '@/integration/useAccount';
import { useHyperCoreSpendable } from '@/integration/useHlpBalances';
import type { HyperCoreFundingDraft } from '@/integration/useInvest';

export interface HyperCoreLegPlan {
  plan: HlpSpotDepositPlan | null;
  requestedUsd6: bigint;
  spendableUsd6: bigint | null;
  accountMode: HyperCoreAccountMode | null;
  /** How far the live balance now falls short of the frozen leg; 0 when it covers it. */
  shortfallUsd6: bigint | null;
  isLoading: boolean;
  isError: boolean;
  /** The leg can be handed to the agent: plan loaded and balance still covers it. */
  isReady: boolean;
}

/**
 * Prepare the HyperCore-funded HLP leg for step 2. Deliberately outside
 * `useInvestReview`, whose contract is to review every frozen source chain in
 * parallel and never read live balances — this leg has no chain to review and
 * its whole risk is that the live Hyperliquid balance moved.
 */
export function useHyperCoreLegPlan(
  draft: HyperCoreFundingDraft | null,
): HyperCoreLegPlan {
  const account = useAccount();
  const hyperCore = useHyperCoreSpendable(account.address);
  const enabled = Boolean(draft && account.address);
  const query = useQuery({
    // Keyed by the frozen amount: the draft is the single source of truth for
    // what this leg deposits.
    queryKey: ['hlp', 'spot-plan', account.address, draft?.requestedUsd6],
    enabled,
    staleTime: Infinity,
    retry: false,
    queryFn: () =>
      getHlpSpotDepositPlan({
        kind: 'hlp-spot-deposit',
        userAddress: account.address as `0x${string}`,
        amountUsd6: draft!.requestedUsd6,
      }),
  });

  const plan = query.data ?? null;
  const requestedUsd6 = draft ? BigInt(draft.requestedUsd6) : 0n;
  const spendableUsd6 = hlpSpendableUsd6(hyperCore.balance);
  const shortfallUsd6 =
    spendableUsd6 === null
      ? null
      : hlpSpendableShortfallUsd6(requestedUsd6, spendableUsd6);

  return {
    plan,
    requestedUsd6,
    spendableUsd6,
    accountMode: hyperCore.balance?.mode ?? null,
    shortfallUsd6,
    isLoading: (enabled && query.isLoading) || hyperCore.isLoading,
    isError: query.isError || hyperCore.isError,
    isReady: plan !== null && shortfallUsd6 === 0n,
  };
}
