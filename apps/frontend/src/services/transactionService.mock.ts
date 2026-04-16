/**
 * ⚠️ MOCK SERVICE - SIMULATION ONLY ⚠️
 *
 * This service provides simulated transaction data for development and testing.
 * - Does NOT make real blockchain transactions
 * - Uses hardcoded token data and artificial delays
 * - Returns simulated transaction hashes
 *
 * @see Phase 9 - Mock Service Clarity
 * @future Replace with real transaction service when backend is ready
 */

import { delay } from "@/lib/http/retry";
import type {
  AllocationBreakdown,
  TransactionFormData,
  TransactionResult,
  TransactionToken,
} from "@/types/domain/transaction";
import { clamp } from "@/utils/mathUtils";

async function simulateBasicTransaction(
  type: TransactionResult["type"],
  data: TransactionFormData,
  message: string
): Promise<TransactionResult> {
  await delay(1100);

  return {
    type,
    status: "success",
    txHash: createTxHash(),
    amount: data.amount,
    token: data.tokenAddress,
    timestamp: Date.now(),
    message,
  };
}

const MOCK_TOKENS: TransactionToken[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xusdc",
    chainId: 1,
    decimals: 6,
    usdPrice: 1,
    category: "stable",
    popular: true,
    logo_url: "/tokens/usdc.svg",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    address: "0xeth",
    chainId: 1,
    decimals: 18,
    usdPrice: 3200,
    category: "crypto",
    popular: true,
    logo_url: "/tokens/eth.svg",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0xwbtc",
    chainId: 1,
    decimals: 8,
    usdPrice: 65000,
    category: "crypto",
    popular: false,
    logo_url: "/tokens/wbtc.svg",
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    address: "0xmatic",
    chainId: 137,
    decimals: 18,
    usdPrice: 0.82,
    category: "crypto",
    popular: true,
    logo_url: "/tokens/matic.svg",
  },
];

const MOCK_TOKEN_BALANCES: Record<
  string,
  { balance: string; usdValue: number }
> = {
  "1:0xusdc": { balance: "1000.50", usdValue: 1000.5 },
  "1:0xeth": { balance: "2.5", usdValue: 8000 },
  "1:0xwbtc": { balance: "0.05", usdValue: 3250 },
  "137:0xmatic": { balance: "1200", usdValue: 984 },
};

function createTxHash(): string {
  return `0x${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`.slice(0, 66);
}

export async function getSupportedTokens(
  chainId: number
): Promise<TransactionToken[]> {
  await delay(120);
  return MOCK_TOKENS.filter(token => token.chainId === chainId);
}

export async function getTokenBalance(
  chainId: number,
  tokenAddress: string
): Promise<{ balance: string; usdValue: number }> {
  await delay(150);
  const key = `${chainId}:${tokenAddress}`;
  return (
    MOCK_TOKEN_BALANCES[key] ?? {
      balance: "0",
      usdValue: 0,
    }
  );
}

export async function simulateDeposit(
  data: TransactionFormData
): Promise<TransactionResult> {
  return simulateBasicTransaction(
    "deposit",
    data,
    "Deposit simulated successfully"
  );
}

export async function simulateWithdraw(
  data: TransactionFormData
): Promise<TransactionResult> {
  return simulateBasicTransaction(
    "withdraw",
    data,
    "Withdraw simulated successfully"
  );
}

export async function simulateRebalance(
  intensity: number,
  currentAllocation: AllocationBreakdown,
  targetAllocation: AllocationBreakdown
): Promise<TransactionResult> {
  await delay(900);

  const projected = computeProjectedAllocation(
    intensity,
    currentAllocation,
    targetAllocation
  );

  return {
    type: "rebalance",
    status: "success",
    txHash: createTxHash(),
    amount: `${projected.crypto.toFixed(2)}`,
    token: "allocation",
    timestamp: Date.now(),
    message: `Rebalanced ${intensity}% towards target`,
  };
}

export function computeProjectedAllocation(
  intensity: number,
  currentAllocation: AllocationBreakdown,
  targetAllocation: AllocationBreakdown
): AllocationBreakdown {
  const intensityFactor = intensity / 100;
  const cryptoDelta = targetAllocation.crypto - currentAllocation.crypto;
  const stableDelta = targetAllocation.stable - currentAllocation.stable;

  return {
    crypto: clamp(
      currentAllocation.crypto + cryptoDelta * intensityFactor,
      0,
      100
    ),
    stable: clamp(
      currentAllocation.stable + stableDelta * intensityFactor,
      0,
      100
    ),
    simplifiedCrypto: currentAllocation.simplifiedCrypto,
  };
}

// Removed duplicate clamp function - now imported from @/utils/mathUtils
