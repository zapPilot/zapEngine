import { equalsAddress } from '@zapengine/types/shared';
import { getAddress, type Address, type PublicClient } from 'viem';

import {
  GmxV2ReaderPricingAdapter,
  type GmxV2PricingAdapter,
} from '../adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import { GmxDepositTooSmallError } from '../errors/intent.errors.js';
import {
  encodeGmxV2CreateDepositMulticall,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_FUNDING_TOKENS,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
  GMX_V2_SWAP_PATHS,
  GMX_V2_TOKENS,
  type GmxV2FundedSide,
  type GmxV2Market,
  type GmxV2MarketKey,
} from '../protocols/gmx-v2/index.js';
import {
  PreparedTransactionSchema,
  type PreparedTransaction,
  type TransactionQuote,
} from '../types/transaction.types.js';
import {
  createApprovalTx,
  validateAllTransactions,
  validatePositiveAmount,
} from './gmx-v2.shared.js';

export interface BuildGmxV2SupplyTxInput {
  marketKey: GmxV2MarketKey;
  fromToken: Address;
  fromAmount: string;
  userAddress: Address;
  /** GM-token mint protection. Defaults to 100 bps and may only be tightened. */
  slippageBps?: number;
}

export interface GmxV2SupplyPlan {
  approvals: PreparedTransaction[];
  steps: PreparedTransaction[];
  executionFeeWei: string;
  /** Spot-price estimate in GM-token base units. */
  estimatedMarketTokens: string;
  /** Slippage-adjusted GM-token base units encoded in createDeposit. */
  minMarketTokens: string;
  market: GmxV2Market;
}

const MAX_DEPOSIT_SLIPPAGE_BPS = GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS;

function applyDepositSlippage(
  estimatedMarketTokens: bigint,
  slippageBps: number,
): bigint {
  const slippageMultiplier = 10_000n - BigInt(slippageBps);
  const minimum =
    (estimatedMarketTokens * slippageMultiplier + 9_999n) / 10_000n;
  if (minimum <= 0n || minimum >= estimatedMarketTokens) {
    throw new GmxDepositTooSmallError(
      'GMX deposit amount is too small to retain a GM-token slippage buffer',
    );
  }
  return minimum;
}

function depositSlippageBps(value: number | undefined): number {
  const slippageBps = value ?? GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS;
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps <= 0 ||
    slippageBps > MAX_DEPOSIT_SLIPPAGE_BPS
  ) {
    throw new Error(
      `GMX deposit slippage must be an integer from 1 to ${MAX_DEPOSIT_SLIPPAGE_BPS} bps`,
    );
  }
  return slippageBps;
}

function approvalFromQuote(
  quote: TransactionQuote,
): PreparedTransaction | null {
  if (!quote.approval) {
    return null;
  }

  return createApprovalTx({
    tokenAddress: quote.approval.tokenAddress,
    spenderAddress: quote.approval.spenderAddress,
    amount: quote.approval.amount,
  });
}

function parseStep(tx: PreparedTransaction): PreparedTransaction {
  return PreparedTransactionSchema.parse(tx);
}

/**
 * The side a deposit token enters, and the hops that turn it into that side's
 * pool token.
 */
interface GmxV2DepositRoute {
  side: GmxV2FundedSide;
  swapPath: GmxV2Market[];
}

/**
 * Straight onto the side whose pool token `token` already is, otherwise
 * through the shortest configured GMX swap path into either pool token.
 */
function depositRoute(market: GmxV2Market, token: Address): GmxV2DepositRoute {
  const routes = (['long', 'short'] as const).flatMap(
    (side): GmxV2DepositRoute[] => {
      const poolToken = side === 'long' ? market.longToken : market.shortToken;
      if (equalsAddress(token, poolToken)) {
        return [{ side, swapPath: [] }];
      }
      const path = GMX_V2_SWAP_PATHS.find(
        (candidate) =>
          equalsAddress(candidate.from, token) &&
          equalsAddress(candidate.to, poolToken),
      );
      return path
        ? [{ side, swapPath: path.via.map((key) => GMX_V2_MARKETS[key]) }]
        : [];
    },
  );
  // Fewest hops wins; the sort is stable, so the long side takes a tie.
  const [route] = routes.sort(
    (left, right) => left.swapPath.length - right.swapPath.length,
  );
  if (!route) {
    throw new Error(
      `GMX v2 has no swap path from ${token} into ${market.name}`,
    );
  }
  return route;
}

/**
 * USDT has no deep GMX market (see GMX_V2_SWAP_PATHS), so it enters the
 * deposit as USDC. A 6-decimal stable-to-stable swap keeps a real slippage
 * buffer down to cents; only sub-cent dust trips the guard.
 */
async function swapUsdtToUsdc(
  input: BuildGmxV2SupplyTxInput,
  fromToken: Address,
  adapter: LiFiAdapter,
): Promise<{
  approval: PreparedTransaction | null;
  step: PreparedTransaction;
  usdcAmount: string;
}> {
  const swapQuote = await adapter.getSwapQuote({
    fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
    toChain: GMX_V2_ARBITRUM_CHAIN_ID,
    fromToken,
    toToken: GMX_V2_TOKENS.USDC.address,
    fromAmount: input.fromAmount,
    fromAddress: input.userAddress,
    toAddress: input.userAddress,
    slippageBps: 50,
  });

  // A floor at or above the quote leaves the on-chain swap zero tolerance, so
  // any execution rounding reverts it — and the atomic batch with it. See
  // docs/gmx-v2-implementation-notes.md (Gate 2).
  const toAmountMin = BigInt(swapQuote.estimate.toAmountMin);
  if (toAmountMin <= 0n || toAmountMin >= BigInt(swapQuote.estimate.toAmount)) {
    throw new GmxDepositTooSmallError(
      `GMX v2 ${input.marketKey} deposit too small: the USDT to USDC swap ` +
        `output has no slippage buffer (toAmountMin ${swapQuote.estimate.toAmountMin}, ` +
        `toAmount ${swapQuote.estimate.toAmount}); increase the deposit amount.`,
    );
  }

  return {
    approval: approvalFromQuote(swapQuote),
    step: parseStep(swapQuote.transaction),
    usdcAmount: swapQuote.estimate.toAmountMin,
  };
}

function buildDepositStep(params: {
  market: GmxV2Market;
  receiver: Address;
  depositToken: Address;
  depositAmount: string;
  route: GmxV2DepositRoute;
  estimatedMarketTokens: string;
  minMarketTokens: string;
  useNativeWntCollateral: boolean;
}): PreparedTransaction {
  const multicall = encodeGmxV2CreateDepositMulticall({
    receiver: params.receiver,
    market: params.market,
    initialToken: params.depositToken,
    amount: BigInt(params.depositAmount),
    side: params.route.side,
    swapPath: params.route.swapPath.map((hop) => hop.marketToken),
    minMarketTokens: BigInt(params.minMarketTokens),
    useNativeWntCollateral: params.useNativeWntCollateral,
  });

  return PreparedTransactionSchema.parse({
    to: GMX_V2_ADDRESSES.exchangeRouter,
    data: multicall.data,
    value: multicall.value,
    chainId: GMX_V2_ARBITRUM_CHAIN_ID,
    gasLimit: GMX_V2_GAS_ESTIMATES.multicall,
    meta: {
      intentType: 'SUPPLY',
      estimatedGas: GMX_V2_GAS_ESTIMATES.multicall,
      estimatedDuration: 60,
      route: {
        tool: 'gmx-v2-direct',
        marketKey: params.market.key,
        swapPath: params.route.swapPath.map((hop) => hop.key),
        asyncSettlement: true,
        executionFeeWei: GMX_V2_EXECUTION_FEE_WEI,
        estimate: {
          toAmount: params.estimatedMarketTokens,
          toAmountMin: params.minMarketTokens,
        },
      },
    },
  });
}

/**
 * GM deposits are funded in a single transfer. A funding token that is not
 * the pool's own token is converted by GMX's keeper along a swap path inside
 * the deposit, so the only slippage bound is the 18-decimal minMarketTokens
 * and small legs still mint.
 */
export async function buildGmxV2SupplyTx(
  input: BuildGmxV2SupplyTxInput,
  adapter: LiFiAdapter,
  publicClient: PublicClient,
  pricingAdapter: GmxV2PricingAdapter = new GmxV2ReaderPricingAdapter(),
): Promise<GmxV2SupplyPlan> {
  validatePositiveAmount(
    input.fromAmount,
    'GMX deposit amount must be greater than zero',
  );

  const market = GMX_V2_MARKETS[input.marketKey];
  const fromToken = getAddress(input.fromToken);
  if (
    !GMX_V2_FUNDING_TOKENS.some((address) => equalsAddress(address, fromToken))
  ) {
    throw new Error(
      'GMX v2 funding token must be canonical Arbitrum USDC, USDT, native ETH, or WETH',
    );
  }
  const slippageBps = depositSlippageBps(input.slippageBps);
  const approvals: PreparedTransaction[] = [];
  const steps: PreparedTransaction[] = [];
  const useNativeWntCollateral = equalsAddress(
    fromToken,
    GMX_V2_TOKENS.ETH.address,
  );
  let depositToken: Address = useNativeWntCollateral
    ? GMX_V2_TOKENS.WETH.address
    : fromToken;
  let depositAmount = input.fromAmount;

  if (equalsAddress(fromToken, GMX_V2_TOKENS.USDT.address)) {
    const swap = await swapUsdtToUsdc(input, fromToken, adapter);
    if (swap.approval) {
      approvals.push(swap.approval);
    }
    steps.push(swap.step);
    depositToken = GMX_V2_TOKENS.USDC.address;
    depositAmount = swap.usdcAmount;
  }

  const route = depositRoute(market, depositToken);
  const estimatedMarketTokens = await pricingAdapter.getDepositAmountOut({
    publicClient,
    market,
    initialToken: depositToken,
    amount: BigInt(depositAmount),
    side: route.side,
    swapPath: route.swapPath,
  });
  const minMarketTokens = applyDepositSlippage(
    estimatedMarketTokens,
    slippageBps,
  );

  if (!useNativeWntCollateral) {
    approvals.push(
      createApprovalTx({
        tokenAddress: depositToken,
        spenderAddress: GMX_V2_ADDRESSES.router,
        amount: depositAmount,
      }),
    );
  }

  steps.push(
    buildDepositStep({
      market,
      receiver: input.userAddress,
      depositToken,
      depositAmount,
      route,
      estimatedMarketTokens: estimatedMarketTokens.toString(),
      minMarketTokens: minMarketTokens.toString(),
      useNativeWntCollateral,
    }),
  );

  validateAllTransactions([...approvals, ...steps]);

  return {
    approvals,
    steps,
    executionFeeWei: GMX_V2_EXECUTION_FEE_WEI,
    estimatedMarketTokens: estimatedMarketTokens.toString(),
    minMarketTokens: minMarketTokens.toString(),
    market,
  };
}
