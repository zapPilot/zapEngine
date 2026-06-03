import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
} from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  encodeGmxV2CreateDepositMulticall,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  type GmxV2Market,
  type GmxV2MarketKey,
} from '../protocols/gmx-v2/index.js';
import {
  PreparedTransactionSchema,
  type PreparedTransaction,
  type TransactionQuote,
} from '../types/transaction.types.js';

export interface BuildGmxV2SupplyTxInput {
  marketKey: GmxV2MarketKey;
  fromToken: Address;
  fromAmount: string;
  userAddress: Address;
}

export interface GmxV2SupplyPlan {
  approvals: PreparedTransaction[];
  steps: PreparedTransaction[];
  executionFeeWei: string;
  market: GmxV2Market;
}

function normalizeAddress(address: Address): string {
  return address.toLowerCase();
}

function validatePositiveAmount(amount: string): bigint {
  const parsed = BigInt(amount);
  if (parsed <= 0n) {
    throw new Error('GMX deposit amount must be greater than zero');
  }
  return parsed;
}

function createApprovalTx(params: {
  tokenAddress: Address;
  spenderAddress: Address;
  amount: string;
}): PreparedTransaction {
  return PreparedTransactionSchema.parse({
    to: params.tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spenderAddress, BigInt(params.amount)],
    }),
    value: '0',
    chainId: GMX_V2_ARBITRUM_CHAIN_ID,
    gasLimit: GMX_V2_GAS_ESTIMATES.approve,
    meta: {
      intentType: 'APPROVAL',
      estimatedGas: GMX_V2_GAS_ESTIMATES.approve,
      estimatedDuration: 0,
    },
  });
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
}): PreparedTransaction {
  const amount = BigInt(params.collateralAmount);
  const multicall = encodeGmxV2CreateDepositMulticall({
    receiver: params.receiver,
    market: params.market,
    ...depositSideAmounts(params.market, amount),
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
      },
    },
  });
}

export async function buildGmxV2SupplyTx(
  input: BuildGmxV2SupplyTxInput,
  adapter: LiFiAdapter,
): Promise<GmxV2SupplyPlan> {
  validatePositiveAmount(input.fromAmount);

  if (
    normalizeAddress(getAddress(input.fromToken)) !==
    normalizeAddress(GMX_V2_TOKENS.USDC.address)
  ) {
    throw new Error('GMX v2 dev deposits require Arbitrum native USDC input');
  }

  const market = GMX_V2_MARKETS[input.marketKey];
  const approvals: PreparedTransaction[] = [];
  const steps: PreparedTransaction[] = [];
  let collateralAmount = input.fromAmount;

  if (
    normalizeAddress(market.collateralToken) !==
    normalizeAddress(GMX_V2_TOKENS.USDC.address)
  ) {
    const swapQuote = await adapter.getSwapQuote({
      fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
      toChain: GMX_V2_ARBITRUM_CHAIN_ID,
      fromToken: GMX_V2_TOKENS.USDC.address,
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
    validatePositiveAmount(collateralAmount);

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
    }),
  );

  for (const tx of [...approvals, ...steps]) {
    PreparedTransactionSchema.parse({
      ...tx,
      data: tx.data as Hex,
    });
  }

  return {
    approvals,
    steps,
    executionFeeWei: GMX_V2_EXECUTION_FEE_WEI,
    market,
  };
}
