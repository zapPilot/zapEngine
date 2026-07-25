import { useUserWallets } from '@zapengine/app-core/hooks/queries/wallet/useUserWallets';

import type { ActivityGroup } from '@/data/demo';
import {
  selectActivityAddressInput,
  selectVisitedBundleUserId,
} from '@/integration/activitySubjectModel';
import { useMoralisWalletHistory } from '@/integration/moralisWallet';

export interface ActivityData {
  groups: ActivityGroup[];
}

/**
 * Who the Activity screen renders history for: the connected user's own bundle,
 * or a visited bundle when a shared `?userId=` link is open.
 */
export interface ActivitySubject {
  isOwnBundle: boolean;
  viewingUserId: string | null;
  ownWalletAddresses: string[];
  ownAddress: string | null;
}

interface UseActivityDataResult {
  data: ActivityData | null;
  isLoading: boolean;
  isError: boolean;
}

export function useActivityData(
  subject: ActivitySubject,
): UseActivityDataResult {
  const visitedUserId = selectVisitedBundleUserId({
    isOwnBundle: subject.isOwnBundle,
    viewingUserId: subject.viewingUserId,
  });
  const visitedWallets = useUserWallets(visitedUserId);
  const visitedWalletAddresses = (visitedWallets.data ?? []).map(
    (row) => row.wallet,
  );

  const address = selectActivityAddressInput({
    isOwnBundle: subject.isOwnBundle,
    ownWalletAddresses: subject.ownWalletAddresses,
    ownAddress: subject.ownAddress,
    visitedWalletAddresses,
  });

  const history = useMoralisWalletHistory(address);

  return {
    data: { groups: history.groups },
    isLoading:
      history.isLoading || (visitedUserId !== null && visitedWallets.isLoading),
    isError: history.isError || visitedWallets.isError,
  };
}
