/**
 * On-chain token balance + USD valuation.
 *
 * Reads REAL wallet balances directly from chain via the shared viem
 * public client (`getPublicClient`, Base-pinned and independent of the
 * wallet's connected chain) and values them using LI.FI spot prices.
 *
 * This is the real counterpart to `transactionService.mock`'s
 * `getTokenBalance` — used by the invest deposit/withdraw panel so it
 * behaves like other DeFi protocols (live balance + $ value).
 */
import { type Address, erc20Abi, formatUnits } from 'viem';

import { getPublicClient, intentEngine } from './intentClient';

/**
 * Sentinel address for the native asset (ETH on Base). Matches the
 * LI.FI / common DeFi convention and the mock token list.
 */
export const NATIVE_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000';

export interface OnChainTokenBalance {
  /** Human-readable balance as a decimal string (e.g. `"1.5"`). */
  balance: string;
  /** Balance valued in USD. Falls back to `0` when pricing is unavailable. */
  usdValue: number;
}

function isNativeToken(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

/**
 * Best-effort spot price. The on-chain balance must still render even
 * when LI.FI is unavailable — we just drop the $ figure in that case.
 */
async function resolvePriceUsd(
  chainId: number,
  tokenAddress: string,
): Promise<number> {
  try {
    const info = await intentEngine.getTokenPrice(chainId, tokenAddress);
    const price = Number.parseFloat(info.priceUSD ?? '');
    return Number.isFinite(price) ? price : 0;
  } catch {
    return 0;
  }
}

export async function getOnChainTokenBalance(
  chainId: number,
  tokenAddress: string,
  decimals: number,
  accountAddress: string,
): Promise<OnChainTokenBalance> {
  const client = getPublicClient(chainId);

  const rawBalance = isNativeToken(tokenAddress)
    ? await client.getBalance({ address: accountAddress as Address })
    : await client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [accountAddress as Address],
      });

  const balance = formatUnits(rawBalance, decimals);
  const priceUsd = await resolvePriceUsd(chainId, tokenAddress);

  return {
    balance,
    usdValue: Number.parseFloat(balance) * priceUsd,
  };
}
