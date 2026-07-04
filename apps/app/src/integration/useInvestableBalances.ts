import {
  type InvestableBalanceRow,
  useWalletAssets,
  type WalletAddressInput,
} from '@/integration/walletTokens';

export type { InvestableBalanceRow };

export interface UseInvestableBalancesResult {
  rows: InvestableBalanceRow[];
  totalUsdValue: number | null;
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useInvestableBalances(
  address: WalletAddressInput,
): UseInvestableBalancesResult {
  const walletAssets = useWalletAssets(address);

  return {
    rows: walletAssets.rows,
    totalUsdValue: walletAssets.totalUsdValue,
    isConnected: walletAssets.isConnected,
    isLoading: walletAssets.isLoading,
    isError: walletAssets.isError,
  };
}
