import {
  type InvestableBalanceRow,
  useMoralisWalletAssets,
} from '@/integration/moralisWallet';

export type { InvestableBalanceRow };

export interface UseInvestableBalancesResult {
  rows: InvestableBalanceRow[];
  totalUsdValue: number | null;
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useInvestableBalances(
  address: string | null,
): UseInvestableBalancesResult {
  const walletAssets = useMoralisWalletAssets(address);

  return {
    rows: walletAssets.rows,
    totalUsdValue: walletAssets.totalUsdValue,
    isConnected: walletAssets.isConnected,
    isLoading: walletAssets.isLoading,
    isError: walletAssets.isError,
  };
}
