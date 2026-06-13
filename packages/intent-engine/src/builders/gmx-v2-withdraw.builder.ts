import { type Address } from 'viem';

import {
  encodeGmxV2CreateWithdrawalMulticall,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
  type GmxV2Market,
  type GmxV2MarketKey,
} from '../protocols/gmx-v2/index.js';
import {
  PreparedTransactionSchema,
  type PreparedTransaction,
} from '../types/transaction.types.js';
import {
  createApprovalTx,
  validateAllTransactions,
  validatePositiveAmount,
} from './gmx-v2.shared.js';

export interface BuildGmxV2WithdrawTxInput {
  marketKey: GmxV2MarketKey;
  gmAmount: string;
  userAddress: Address;
}

export interface GmxV2WithdrawPlan {
  approvals: PreparedTransaction[];
  steps: PreparedTransaction[];
  executionFeeWei: string;
  market: GmxV2Market;
}

function buildWithdrawalStep(params: {
  market: GmxV2Market;
  receiver: Address;
  gmTokenAmount: string;
}): PreparedTransaction {
  const multicall = encodeGmxV2CreateWithdrawalMulticall({
    receiver: params.receiver,
    market: params.market,
    gmTokenAmount: BigInt(params.gmTokenAmount),
  });

  return PreparedTransactionSchema.parse({
    to: GMX_V2_ADDRESSES.exchangeRouter,
    data: multicall.data,
    value: multicall.value,
    chainId: GMX_V2_ARBITRUM_CHAIN_ID,
    gasLimit: GMX_V2_GAS_ESTIMATES.withdrawalMulticall,
    meta: {
      intentType: 'WITHDRAW',
      estimatedGas: GMX_V2_GAS_ESTIMATES.withdrawalMulticall,
      estimatedDuration: 60,
      route: {
        tool: 'gmx-v2-direct',
        marketKey: params.market.key,
        asyncSettlement: true,
      },
    },
  });
}

/**
 * Build a GMX v2 GM-market withdrawal plan for the dev-only Arbitrum path.
 *
 * Burns GM market tokens and returns the market's native long/short tokens to
 * the user. Unlike Morpho's synchronous redeem, the GMX keeper settles the
 * underlying tokens asynchronously — so there is no atomic LiFi swap leg here;
 * the user receives the raw long/short tokens (e.g. WBTC.b / USDC).
 *
 * Steps: approve(GM token → router), then a single multicall to the
 * ExchangeRouter (sendWnt + sendTokens + createWithdrawal). Approvals are kept
 * separate from steps so the execution layer can batch them under EIP-7702.
 */
export function buildGmxV2WithdrawTx(
  input: BuildGmxV2WithdrawTxInput,
): GmxV2WithdrawPlan {
  validatePositiveAmount(
    input.gmAmount,
    'GMX withdrawal amount must be greater than zero',
  );

  const market = GMX_V2_MARKETS[input.marketKey];

  const approvals: PreparedTransaction[] = [
    createApprovalTx({
      tokenAddress: market.marketToken,
      spenderAddress: GMX_V2_ADDRESSES.router,
      amount: input.gmAmount,
    }),
  ];

  const steps: PreparedTransaction[] = [
    buildWithdrawalStep({
      market,
      receiver: input.userAddress,
      gmTokenAmount: input.gmAmount,
    }),
  ];

  validateAllTransactions([...approvals, ...steps]);

  return {
    approvals,
    steps,
    executionFeeWei: GMX_V2_EXECUTION_FEE_WEI,
    market,
  };
}
