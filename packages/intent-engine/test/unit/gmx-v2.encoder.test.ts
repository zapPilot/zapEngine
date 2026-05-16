import { describe, expect, it } from 'vitest';
import { decodeFunctionData, type Address, type Hex } from 'viem';

import {
  encodeGmxV2CreateDeposit,
  encodeGmxV2CreateDepositMulticall,
  encodeGmxV2SendTokens,
  encodeGmxV2SendWnt,
} from '../../src/protocols/gmx-v2/gmx-v2.encoder.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_MARKETS,
  type GmxV2Market,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;

const SELECTORS = {
  multicall: '0xac9650d8',
  sendWnt: '0x7d39aaf1',
  sendTokens: '0xe6d66ac8',
  createDeposit: '0xc82aa41b',
} as const;

function collateralAmounts(market: GmxV2Market, amount: bigint) {
  return market.fundedSide === 'long'
    ? { longTokenAmount: amount, shortTokenAmount: 0n }
    : { longTokenAmount: 0n, shortTokenAmount: amount };
}

function decodeMulticallCalls(data: Hex): Hex[] {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  return decoded.args[0] as Hex[];
}

describe('GMX v2 calldata encoders', () => {
  it('encodes sendWnt(address,uint256)', () => {
    const data = encodeGmxV2SendWnt(GMX_V2_ADDRESSES.depositVault, 1_000_000n);

    expect(data.slice(0, 10)).toBe(SELECTORS.sendWnt);
    const decoded = decodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      data,
    });
    expect(decoded.functionName).toBe('sendWnt');
    expect(decoded.args).toEqual([GMX_V2_ADDRESSES.depositVault, 1_000_000n]);
  });

  it('encodes sendTokens(address,address,uint256)', () => {
    const market = GMX_V2_MARKETS['btc-usdc'];
    const data = encodeGmxV2SendTokens(
      market.shortToken,
      GMX_V2_ADDRESSES.depositVault,
      2_000_000n,
    );

    expect(data.slice(0, 10)).toBe(SELECTORS.sendTokens);
    const decoded = decodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      data,
    });
    expect(decoded.functionName).toBe('sendTokens');
    expect(decoded.args).toEqual([
      market.shortToken,
      GMX_V2_ADDRESSES.depositVault,
      2_000_000n,
    ]);
  });

  it('encodes createDeposit with the live GMX tuple order', () => {
    const market = GMX_V2_MARKETS['eth-usdc'];
    const data = encodeGmxV2CreateDeposit({
      receiver: USER,
      marketToken: market.marketToken,
      longToken: market.longToken,
      shortToken: market.shortToken,
      executionFee: BigInt(GMX_V2_EXECUTION_FEE_WEI),
    });

    expect(data.slice(0, 10)).toBe(SELECTORS.createDeposit);
    const decoded = decodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      data,
    });
    expect(decoded.functionName).toBe('createDeposit');
    const [params] = decoded.args as [
      {
        addresses: {
          receiver: Address;
          callbackContract: Address;
          uiFeeReceiver: Address;
          market: Address;
          initialLongToken: Address;
          initialShortToken: Address;
          longTokenSwapPath: Address[];
          shortTokenSwapPath: Address[];
        };
        minMarketTokens: bigint;
        shouldUnwrapNativeToken: boolean;
        executionFee: bigint;
        callbackGasLimit: bigint;
        dataList: Hex[];
      },
    ];

    expect(params.addresses).toMatchObject({
      receiver: USER,
      callbackContract: '0x0000000000000000000000000000000000000000',
      uiFeeReceiver: '0x0000000000000000000000000000000000000000',
      market: market.marketToken,
      initialLongToken: market.longToken,
      initialShortToken: market.shortToken,
    });
    expect(params.addresses.longTokenSwapPath).toEqual([]);
    expect(params.addresses.shortTokenSwapPath).toEqual([]);
    expect(params.minMarketTokens).toBe(0n);
    expect(params.shouldUnwrapNativeToken).toBe(false);
    expect(params.executionFee).toBe(BigInt(GMX_V2_EXECUTION_FEE_WEI));
    expect(params.callbackGasLimit).toBe(0n);
    expect(params.dataList).toEqual([]);
  });

  it.each(Object.entries(GMX_V2_MARKETS))(
    'encodes the %s createDeposit multicall',
    (_key, market) => {
      const amount = 10_000n;
      const { data, value } = encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market,
        ...collateralAmounts(market, amount),
      });

      expect(data.slice(0, 10)).toBe(SELECTORS.multicall);
      expect(value).toBe(GMX_V2_EXECUTION_FEE_WEI);

      const calls = decodeMulticallCalls(data);
      expect(calls).toHaveLength(3);

      const sendWnt = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[0]!,
      });
      expect(sendWnt.functionName).toBe('sendWnt');
      expect(sendWnt.args).toEqual([
        GMX_V2_ADDRESSES.depositVault,
        BigInt(GMX_V2_EXECUTION_FEE_WEI),
      ]);

      const fundedToken =
        market.fundedSide === 'long' ? market.longToken : market.shortToken;
      const sendTokens = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[1]!,
      });
      expect(sendTokens.functionName).toBe('sendTokens');
      expect(sendTokens.args).toEqual([
        fundedToken,
        GMX_V2_ADDRESSES.depositVault,
        amount,
      ]);

      const createDeposit = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[2]!,
      });
      expect(createDeposit.functionName).toBe('createDeposit');
      const [params] = createDeposit.args as [
        {
          addresses: {
            receiver: Address;
            market: Address;
            initialLongToken: Address;
            initialShortToken: Address;
          };
          executionFee: bigint;
        },
      ];
      expect(params.addresses.receiver).toBe(USER);
      expect(params.addresses.market).toBe(market.marketToken);
      expect(params.addresses.initialLongToken).toBe(market.longToken);
      expect(params.addresses.initialShortToken).toBe(market.shortToken);
      expect(params.executionFee).toBe(BigInt(GMX_V2_EXECUTION_FEE_WEI));
    },
  );

  it('rejects a multicall with no funded collateral amount', () => {
    expect(() =>
      encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market: GMX_V2_MARKETS['btc-usdc'],
        longTokenAmount: 0n,
        shortTokenAmount: 0n,
      }),
    ).toThrow('GMX deposit amount must be greater than zero');
  });
});
