/**
 * Transaction Data Hook
 *
 * Fetches and manages transaction-related data including:
 * - Available chains
 * - Supported tokens for selected chain
 * - Token balances
 * - USD amount calculation
 *
 * Simplified consolidation of useTransactionTokenData and useTransactionViewModel.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useChainQuery } from "@/hooks/queries/wallet/useChainQuery";
import { useTokenBalanceQuery } from "@/hooks/queries/wallet/useTokenBalanceQuery";
import { transactionServiceMock } from "@/services";
import type {
  ChainData,
  TokenBalance,
  TransactionToken,
} from "@/types/domain/transaction";

interface UseTransactionDataParams {
  /**
   * Whether the modal is open (enables queries)
   */
  isOpen: boolean;

  /**
   * Selected chain ID
   */
  chainId: number | undefined;

  /**
   * Selected token address
   */
  tokenAddress: string | undefined;

  /**
   * Transaction amount as string
   */
  amount: string;
}

interface UseTransactionDataResult {
  chainList: ChainData[];
  selectedChain: ChainData | null;
  availableTokens: TransactionToken[];
  selectedToken: TransactionToken | null;
  tokenQuery: UseQueryResult<TransactionToken[], Error>;
  balances: Record<string, TokenBalance>;
  balanceQuery: ReturnType<typeof useTokenBalanceQuery>;
  usdAmount: number;
  isLoadingTokens: boolean;
  isLoadingBalance: boolean;
  isLoading: boolean;
}

function normalizeChainList(
  chains: ChainData[] | ChainData | null | undefined
): ChainData[] {
  if (Array.isArray(chains)) {
    return chains;
  }

  if (chains) {
    return [chains];
  }

  return [];
}

function resolveSelectedToken(
  availableTokens: TransactionToken[] | undefined,
  tokenAddress: string | undefined
): TransactionToken | null {
  if (!availableTokens?.length) {
    return null;
  }

  const selectedToken = availableTokens.find(
    token => token.address === tokenAddress
  );

  return selectedToken ?? availableTokens[0] ?? null;
}

function mapTokenBalances(
  selectedToken: TransactionToken | null,
  tokenBalance: TokenBalance | undefined
): Record<string, TokenBalance> {
  if (!selectedToken || !tokenBalance) {
    return {};
  }

  return {
    [selectedToken.address]: tokenBalance,
  };
}

function calculateUsdAmount(
  amount: string,
  usdPrice: number | undefined
): number {
  const numericAmount = parseFloat(amount || "0");
  if (!usdPrice || Number.isNaN(numericAmount)) {
    return 0;
  }

  return numericAmount * usdPrice;
}

export function useTransactionData({
  isOpen,
  chainId,
  tokenAddress,
  amount,
}: UseTransactionDataParams): UseTransactionDataResult {
  const { data: chains } = useChainQuery();
  const chainList = normalizeChainList(chains);

  const tokenQuery = useQuery({
    queryKey: ["transaction-tokens", chainId],
    queryFn: () => {
      if (chainId === undefined) {
        throw new Error("Chain ID is required to load tokens");
      }
      return transactionServiceMock.getSupportedTokens(chainId);
    },
    enabled: isOpen && Boolean(chainId),
  });

  const selectedToken: TransactionToken | null = resolveSelectedToken(
    tokenQuery.data,
    tokenAddress
  );

  const balanceQuery = useTokenBalanceQuery(chainId, selectedToken?.address, {
    enabled: isOpen && Boolean(selectedToken),
  });

  const balances: Record<string, TokenBalance> = mapTokenBalances(
    selectedToken,
    balanceQuery.data
  );

  const usdAmount = calculateUsdAmount(amount, selectedToken?.usdPrice);

  const selectedChain: ChainData | null =
    chainList.find(chain => chain.chainId === chainId) ?? null;
  const isLoadingTokens = tokenQuery.isLoading;
  const isLoadingBalance = balanceQuery.isLoading;

  return {
    chainList,
    selectedChain,
    availableTokens: tokenQuery.data ?? [],
    selectedToken,
    tokenQuery,
    balances,
    balanceQuery,
    usdAmount,
    isLoadingTokens,
    isLoadingBalance,
    isLoading: isLoadingTokens || isLoadingBalance,
  };
}
