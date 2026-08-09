import { getAddress, type Address, type PublicClient } from 'viem';

import {
  GmxV2ReaderPricingAdapter,
  type GmxV2PricingAdapter,
} from '../adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  encodeGmxV2CreateDepositMulticall,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_FUNDING_TOKENS,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
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
    throw new Error(
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

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
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

function depositSideAmounts(
  market: GmxV2Market,
  amount: bigint,
): { longTokenAmount: bigint; shortTokenAmount: bigint } {
  // Single-collateral GM markets (longToken === shortToken, e.g. GM BTC/BTC
  // [WBTC.b-WBTC.b]) reject a deposit funded on only one side: the GMX
  // ExchangeRouter reverts before the DepositHandler even runs. They must be
  // funded on BOTH sides — half long, half short — which makes the multicall
  // emit two `sendTokens`, exactly as the GMX UI does. Verified against a real
  // on-chain GM BTC/BTC deposit and a Tenderly Arbitrum fork: a single
  // `sendTokens` reverts, the 50/50 split succeeds. See
  // docs/gmx-v2-implementation-notes.md (Gate 1).
  if (
    normalizeAddress(market.longToken) === normalizeAddress(market.shortToken)
  ) {
    const longTokenAmount = amount / 2n;
    return { longTokenAmount, shortTokenAmount: amount - longTokenAmount };
  }

  return {
    longTokenAmount: market.fundedSide === 'long' ? amount : 0n,
    shortTokenAmount: market.fundedSide === 'short' ? amount : 0n,
  };
}

function buildDepositStep(params: {
  market: GmxV2Market;
  receiver: Address;
  collateralAmount: string;
  estimatedMarketTokens: string;
  minMarketTokens: string;
}): PreparedTransaction {
  const amount = BigInt(params.collateralAmount);
  const multicall = encodeGmxV2CreateDepositMulticall({
    receiver: params.receiver,
    market: params.market,
    ...depositSideAmounts(params.market, amount),
    minMarketTokens: BigInt(params.minMarketTokens),
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
        asyncSettlement: true,
        estimate: {
          toAmount: params.estimatedMarketTokens,
          toAmountMin: params.minMarketTokens,
        },
      },
    },
  });
}

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
  const normalizedFromToken = getAddress(input.fromToken);
  const supportedFundingToken = GMX_V2_FUNDING_TOKENS.some(
    (address) =>
      normalizeAddress(address) === normalizeAddress(normalizedFromToken),
  );
  if (!supportedFundingToken) {
    throw new Error(
      'GMX v2 funding token must be canonical Arbitrum USDC, USDT, or native ETH',
    );
  }
  const slippageBps = depositSlippageBps(input.slippageBps);
  const approvals: PreparedTransaction[] = [];
  const steps: PreparedTransaction[] = [];
  let collateralAmount = input.fromAmount;

  if (
    normalizeAddress(market.collateralToken) !==
    normalizeAddress(normalizedFromToken)
  ) {
    const swapQuote = await adapter.getSwapQuote({
      fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
      toChain: GMX_V2_ARBITRUM_CHAIN_ID,
      fromToken: normalizedFromToken,
      toToken: market.collateralToken,
      fromAmount: input.fromAmount,
      fromAddress: input.userAddress,
      toAddress: input.userAddress,
      slippageBps: 50,
    });

    const swapApproval = approvalFromQuote(swapQuote);
    if (swapApproval) {
      approvals.push(swapApproval);
    }

    steps.push(parseStep(swapQuote.transaction));
    collateralAmount = swapQuote.estimate.toAmountMin;
    validatePositiveAmount(
      collateralAmount,
      'GMX deposit amount must be greater than zero',
    );

    // Dust guard: at tiny sizes the swap output is a 2-digit number of
    // 8-decimal WBTC units, so LiFi's slippage buffer rounds away to nothing
    // (toAmountMin === toAmount) — the on-chain swap then has ZERO tolerance
    // and reverts inside LiFi GenericSwapFacetV3 on any execution rounding,
    // taking the whole EIP-7702 atomic batch with it. Reject early with a clear
    // message instead of an opaque on-chain revert. (The ~0.001-ETH GMX
    // execution fee also makes such dust deposits economically nonsensical.)
    // See docs/gmx-v2-implementation-notes.md (Gate 2).
    if (
      BigInt(swapQuote.estimate.toAmountMin) >=
      BigInt(swapQuote.estimate.toAmount)
    ) {
      throw new Error(
        `GMX v2 ${input.marketKey} deposit too small: swap output has no ` +
          `slippage buffer (toAmountMin ${swapQuote.estimate.toAmountMin} === ` +
          `toAmount ${swapQuote.estimate.toAmount}); increase the deposit amount.`,
      );
    }
  }

  const sideAmounts = depositSideAmounts(market, BigInt(collateralAmount));
  const estimatedMarketTokens = await pricingAdapter.getDepositAmountOut({
    publicClient,
    market,
    ...sideAmounts,
  });
  const minMarketTokens = applyDepositSlippage(
    estimatedMarketTokens,
    slippageBps,
  );

  approvals.push(
    createApprovalTx({
      tokenAddress: market.collateralToken,
      spenderAddress: GMX_V2_ADDRESSES.router,
      amount: collateralAmount,
    }),
  );

  steps.push(
    buildDepositStep({
      market,
      receiver: input.userAddress,
      collateralAmount,
      estimatedMarketTokens: estimatedMarketTokens.toString(),
      minMarketTokens: minMarketTokens.toString(),
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
