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
  minMarketTokens?: bigint;
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
  minMarketTokens?: bigint;
}

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
        minMarketTokens: params.minMarketTokens ?? 0n,
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
      minMarketTokens: params.minMarketTokens ?? 0n,
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
