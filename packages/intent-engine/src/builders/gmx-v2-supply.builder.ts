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

function buildDepositStep(params: {
  market: GmxV2Market;
  receiver: Address;
  collateralAmount: string;
}): PreparedTransaction {
  const amount = BigInt(params.collateralAmount);
  const multicall = encodeGmxV2CreateDepositMulticall({
    receiver: params.receiver,
    market: params.market,
    longTokenAmount: params.market.fundedSide === 'long' ? amount : 0n,
    shortTokenAmount: params.market.fundedSide === 'short' ? amount : 0n,
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
