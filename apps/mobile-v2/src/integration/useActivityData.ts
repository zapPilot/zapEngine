import type { ActivityGroup } from '@/data/demo';
import {
  useMoralisWalletHistory,
  type WalletAddressInput,
} from '@/integration/moralisWallet';

export interface ActivityData {
  groups: ActivityGroup[];
}

interface UseActivityDataResult {
  data: ActivityData | null;
  isLoading: boolean;
  isError: boolean;
}

export function useActivityData(
  address: WalletAddressInput,
): UseActivityDataResult {
  const history = useMoralisWalletHistory(address);

  return {
    data: { groups: history.groups },
    isLoading: history.isLoading,
    isError: history.isError,
  };
}
