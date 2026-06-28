import { useTokenBalances } from '@zapengine/app-core/hooks/queries/wallet/useTokenBalances';

import {
  BASE_DEPOSIT_TOKENS,
  type DesktopDepositToken,
  toBalanceToken,
} from '@/integration/depositTokens';

export interface InvestableBalanceRow {
  token: DesktopDepositToken;
  balance: string | null;
  amountLabel: string;
  usdValue: number | null;
  usdPrice: number | null;
  isLoading: boolean;
  isError: boolean;
}

export interface UseInvestableBalancesResult {
  rows: InvestableBalanceRow[];
  totalUsdValue: number | null;
  isConnected: boolean;
  isLoading: boolean;
  isError: boolean;
}

const BALANCE_TOKENS = BASE_DEPOSIT_TOKENS.map(toBalanceToken);

function formatTokenBalance(value: string | undefined, symbol: string): string {
  if (!value) {
    return '—';
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return '—';
  }
  const maximumFractionDigits = symbol === 'USDC' ? 2 : 4;
  return `${parsed.toLocaleString('en-US', {
    maximumFractionDigits,
  })} ${symbol}`;
}

export function useInvestableBalances(): UseInvestableBalancesResult {
  const { byAddress, isConnected } = useTokenBalances(
    BASE_DEPOSIT_TOKENS[0]?.chainId,
    BALANCE_TOKENS,
  );

  const rows = BASE_DEPOSIT_TOKENS.map((token): InvestableBalanceRow => {
    const query = byAddress.get(token.balanceAddress);
    const data = query?.data;
    const balanceNumber = data ? Number.parseFloat(data.balance) : Number.NaN;
    const usdPrice =
      data &&
      Number.isFinite(balanceNumber) &&
      balanceNumber > 0 &&
      data.usdValue > 0
        ? data.usdValue / balanceNumber
        : token.symbol === 'USDC'
          ? 1
          : null;

    return {
      token,
      balance: data?.balance ?? null,
      amountLabel: formatTokenBalance(data?.balance, token.symbol),
      usdValue: data?.usdValue ?? null,
      usdPrice,
      isLoading: Boolean(query?.isLoading),
      isError: Boolean(query?.isError),
    };
  });

  const liveValues = rows
    .map((row) => row.usdValue)
    .filter((value): value is number => typeof value === 'number');

  return {
    rows,
    totalUsdValue:
      liveValues.length > 0
        ? liveValues.reduce((total, value) => total + value, 0)
        : null,
    isConnected,
    isLoading: rows.some((row) => row.isLoading),
    isError: rows.some((row) => row.isError),
  };
}
