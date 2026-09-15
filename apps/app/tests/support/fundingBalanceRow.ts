import type { DesktopDepositToken } from '@/integration/depositTokens';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';

/** One wallet balance row for a funding token. A null price leaves it unquoted. */
export function balanceRow(
  token: DesktopDepositToken,
  usd: number,
  price: number | null = token.symbol === 'ETH' ? 2000 : 1,
): ChainTokenBalanceRow {
  return {
    id: `${token.chainId}:${token.symbol}`,
    chain: token.chainKey,
    chainLabel: token.chainKey,
    chainId: token.chainId,
    tokenAddress: token.balanceAddress,
    decimals: token.decimals,
    balance: String(usd / (price ?? 2000)),
    balanceBaseUnits:
      token.symbol === 'ETH'
        ? (
            BigInt(Math.round((usd * 1e6) / (price ?? 2000))) *
            10n ** 12n
          ).toString()
        : String(Math.round(usd * 1e6)),
    usdValue: price === null ? null : usd,
    usdPrice: price,
    token: { symbol: token.symbol, name: token.name },
  };
}
