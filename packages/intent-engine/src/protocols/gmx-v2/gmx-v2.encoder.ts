import { encodeFunctionData, type Address, type Hex } from 'viem';

import {
  GMX_V2_ADDRESSES,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  type GmxV2Market,
} from './gmx-v2.constants.js';

export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as Address;

export interface GmxV2CreateDepositParams {
  receiver: Address;
  marketToken: Address;
  longToken: Address;
  shortToken: Address;
  executionFee: bigint;
  callbackContract?: Address;
  uiFeeReceiver?: Address;
  longTokenSwapPath?: readonly Address[];
  shortTokenSwapPath?: readonly Address[];
  minMarketTokens: bigint;
  shouldUnwrapNativeToken?: boolean;
  callbackGasLimit?: bigint;
  dataList?: readonly Hex[];
}

export interface GmxV2CreateDepositMulticallParams {
  receiver: Address;
  market: GmxV2Market;
  longTokenAmount: bigint;
  shortTokenAmount: bigint;
  executionFee?: bigint;
  minMarketTokens: bigint;
}

export interface GmxV2CreateWithdrawalParams {
  receiver: Address;
  marketToken: Address;
  executionFee: bigint;
  callbackContract?: Address;
  uiFeeReceiver?: Address;
  longTokenSwapPath?: readonly Address[];
  shortTokenSwapPath?: readonly Address[];
  minLongTokenAmount?: bigint;
  minShortTokenAmount?: bigint;
  shouldUnwrapNativeToken?: boolean;
  callbackGasLimit?: bigint;
  dataList?: readonly Hex[];
}

export interface GmxV2CreateWithdrawalMulticallParams {
  receiver: Address;
  market: GmxV2Market;
  gmTokenAmount: bigint;
  executionFee?: bigint;
  minLongTokenAmount?: bigint;
  minShortTokenAmount?: bigint;
}

/* jscpd:ignore-start */
export function encodeGmxV2SendWnt(receiver: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    functionName: 'sendWnt',
    args: [receiver, amount],
  });
}

export function encodeGmxV2SendTokens(
  token: Address,
  receiver: Address,
  amount: bigint,
): Hex {
  return encodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    functionName: 'sendTokens',
    args: [token, receiver, amount],
  });
}
/* jscpd:ignore-end */

export function encodeGmxV2CreateDeposit(
  params: GmxV2CreateDepositParams,
): Hex {
  return encodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    functionName: 'createDeposit',
    args: [
      {
        addresses: {
          receiver: params.receiver,
          callbackContract: params.callbackContract ?? ZERO_ADDRESS,
          uiFeeReceiver: params.uiFeeReceiver ?? ZERO_ADDRESS,
          market: params.marketToken,
          initialLongToken: params.longToken,
          initialShortToken: params.shortToken,
          longTokenSwapPath: [...(params.longTokenSwapPath ?? [])],
          shortTokenSwapPath: [...(params.shortTokenSwapPath ?? [])],
        },
        minMarketTokens: params.minMarketTokens,
        shouldUnwrapNativeToken: params.shouldUnwrapNativeToken ?? false,
        executionFee: params.executionFee,
        callbackGasLimit: params.callbackGasLimit ?? 0n,
        dataList: [...(params.dataList ?? [])],
      },
    ],
  });
}

export function encodeGmxV2CreateDepositMulticall(
  params: GmxV2CreateDepositMulticallParams,
): { data: Hex; value: string } {
  if (params.longTokenAmount <= 0n && params.shortTokenAmount <= 0n) {
    throw new Error('GMX deposit amount must be greater than zero');
  }
  if (params.minMarketTokens <= 0n) {
    throw new Error('GMX minMarketTokens must be greater than zero');
  }

  const executionFee = params.executionFee ?? BigInt(GMX_V2_EXECUTION_FEE_WEI);
  const calls: Hex[] = [
    encodeGmxV2SendWnt(GMX_V2_ADDRESSES.depositVault, executionFee),
  ];

  if (params.longTokenAmount > 0n) {
    calls.push(
      encodeGmxV2SendTokens(
        params.market.longToken,
        GMX_V2_ADDRESSES.depositVault,
        params.longTokenAmount,
      ),
    );
  }

  if (params.shortTokenAmount > 0n) {
    calls.push(
      encodeGmxV2SendTokens(
        params.market.shortToken,
        GMX_V2_ADDRESSES.depositVault,
        params.shortTokenAmount,
      ),
    );
  }

  calls.push(
    encodeGmxV2CreateDeposit({
      receiver: params.receiver,
      marketToken: params.market.marketToken,
      longToken: params.market.longToken,
      shortToken: params.market.shortToken,
      executionFee,
      minMarketTokens: params.minMarketTokens,
    }),
  );

  return {
    data: encodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      functionName: 'multicall',
      args: [calls],
    }),
    value: executionFee.toString(10),
  };
}

export function encodeGmxV2CreateWithdrawal(
  params: GmxV2CreateWithdrawalParams,
): Hex {
  return encodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    functionName: 'createWithdrawal',
    args: [
      {
        addresses: {
          receiver: params.receiver,
          callbackContract: params.callbackContract ?? ZERO_ADDRESS,
          uiFeeReceiver: params.uiFeeReceiver ?? ZERO_ADDRESS,
          market: params.marketToken,
          longTokenSwapPath: [...(params.longTokenSwapPath ?? [])],
          shortTokenSwapPath: [...(params.shortTokenSwapPath ?? [])],
        },
        minLongTokenAmount: params.minLongTokenAmount ?? 0n,
        minShortTokenAmount: params.minShortTokenAmount ?? 0n,
        shouldUnwrapNativeToken: params.shouldUnwrapNativeToken ?? false,
        executionFee: params.executionFee,
        callbackGasLimit: params.callbackGasLimit ?? 0n,
        dataList: [...(params.dataList ?? [])],
      },
    ],
  });
}

export function encodeGmxV2CreateWithdrawalMulticall(
  params: GmxV2CreateWithdrawalMulticallParams,
): { data: Hex; value: string } {
  if (params.gmTokenAmount <= 0n) {
    throw new Error('GMX withdrawal amount must be greater than zero');
  }

  const executionFee = params.executionFee ?? BigInt(GMX_V2_EXECUTION_FEE_WEI);

  // Mirror the deposit multicall, but route the GM market token into the
  // WithdrawalVault: pay the keeper execution fee, send the GM tokens to burn,
  // then create the withdrawal. The keeper settles long/short tokens back to
  // `receiver` asynchronously.
  const calls: Hex[] = [
    encodeGmxV2SendWnt(GMX_V2_ADDRESSES.withdrawalVault, executionFee),
    encodeGmxV2SendTokens(
      params.market.marketToken,
      GMX_V2_ADDRESSES.withdrawalVault,
      params.gmTokenAmount,
    ),
    encodeGmxV2CreateWithdrawal({
      receiver: params.receiver,
      marketToken: params.market.marketToken,
      executionFee,
      minLongTokenAmount: params.minLongTokenAmount ?? 0n,
      minShortTokenAmount: params.minShortTokenAmount ?? 0n,
    }),
  ];

  return {
    data: encodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      functionName: 'multicall',
      args: [calls],
    }),
    value: executionFee.toString(10),
  };
}
