import { describe, expect, it } from 'vitest';
import { decodeFunctionData, type Address, type Hex } from 'viem';

import {
  encodeGmxV2CreateDeposit,
  encodeGmxV2CreateDepositMulticall,
  encodeGmxV2CreateWithdrawal,
  encodeGmxV2CreateWithdrawalMulticall,
  encodeGmxV2SendTokens,
  encodeGmxV2SendWnt,
} from '../../src/protocols/gmx-v2/gmx-v2.encoder.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  type GmxV2Market,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const MIN_MARKET_TOKENS = 9_900n;

const SELECTORS = {
  multicall: '0xac9650d8',
  sendWnt: '0x7d39aaf1',
  sendTokens: '0xe6d66ac8',
  createDeposit: '0xc82aa41b',
} as const;

function directDeposit(market: GmxV2Market, amount: bigint) {
  return {
    initialToken: market.collateralToken,
    amount,
    side:
      market.collateralToken === market.longToken
        ? ('long' as const)
        : ('short' as const),
  };
}

interface DecodedCreateDeposit {
  addresses: {
    receiver: Address;
    market: Address;
    initialLongToken: Address;
    initialShortToken: Address;
    longTokenSwapPath: readonly Address[];
    shortTokenSwapPath: readonly Address[];
  };
  executionFee: bigint;
  minMarketTokens: bigint;
}

function decodeMulticall(data: Hex) {
  const calls = decodeMulticallCalls(data).map((call) =>
    decodeFunctionData({ abi: GMX_V2_EXCHANGE_ROUTER_ABI, data: call }),
  );
  const createDeposit = calls.at(-1)!;
  expect(createDeposit.functionName).toBe('createDeposit');
  return {
    calls,
    params: (createDeposit.args as unknown as [DecodedCreateDeposit])[0],
  };
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
      initialLongToken: market.longToken,
      initialShortToken: market.shortToken,
      executionFee: BigInt(GMX_V2_EXECUTION_FEE_WEI),
      minMarketTokens: MIN_MARKET_TOKENS,
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
    expect(params.minMarketTokens).toBe(MIN_MARKET_TOKENS);
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
        ...directDeposit(market, amount),
        minMarketTokens: MIN_MARKET_TOKENS,
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

      const fundedToken = market.collateralToken;
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
      const [params] = createDeposit.args as unknown as [
        {
          addresses: {
            receiver: Address;
            market: Address;
            initialLongToken: Address;
            initialShortToken: Address;
          };
          executionFee: bigint;
          minMarketTokens: bigint;
        },
      ];
      expect(params.addresses.receiver).toBe(USER);
      expect(params.addresses.market).toBe(market.marketToken);
      expect(params.addresses.initialLongToken).toBe(market.longToken);
      expect(params.addresses.initialShortToken).toBe(market.shortToken);
      expect(params.executionFee).toBe(BigInt(GMX_V2_EXECUTION_FEE_WEI));
      expect(params.minMarketTokens).toBe(MIN_MARKET_TOKENS);
    },
  );

  it('rejects a multicall with no funded collateral amount', () => {
    expect(() =>
      encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market: GMX_V2_MARKETS['btc-usdc'],
        ...directDeposit(GMX_V2_MARKETS['btc-usdc'], 0n),
        minMarketTokens: MIN_MARKET_TOKENS,
      }),
    ).toThrow('GMX deposit amount must be greater than zero');
  });

  it('rejects a deposit multicall without positive GM-token protection', () => {
    expect(() =>
      encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market: GMX_V2_MARKETS['btc-usdc'],
        ...directDeposit(GMX_V2_MARKETS['btc-usdc'], 10_000n),
        minMarketTokens: 0n,
      }),
    ).toThrow('GMX minMarketTokens must be greater than zero');
  });

  it('encodes createWithdrawal with the live GMX tuple order', () => {
    const market = GMX_V2_MARKETS['eth-usdc'];
    const data = encodeGmxV2CreateWithdrawal({
      receiver: USER,
      marketToken: market.marketToken,
      executionFee: BigInt(GMX_V2_EXECUTION_FEE_WEI),
    });

    const decoded = decodeFunctionData({
      abi: GMX_V2_EXCHANGE_ROUTER_ABI,
      data,
    });
    expect(decoded.functionName).toBe('createWithdrawal');
    const [params] = decoded.args as [
      {
        addresses: {
          receiver: Address;
          callbackContract: Address;
          uiFeeReceiver: Address;
          market: Address;
          longTokenSwapPath: Address[];
          shortTokenSwapPath: Address[];
        };
        minLongTokenAmount: bigint;
        minShortTokenAmount: bigint;
        shouldUnwrapNativeToken: boolean;
        executionFee: bigint;
        callbackGasLimit: bigint;
        dataList: Hex[];
      },
    ];

    // Withdrawal addresses tuple has NO initialLong/ShortToken (unlike deposit).
    expect(params.addresses).toMatchObject({
      receiver: USER,
      callbackContract: '0x0000000000000000000000000000000000000000',
      uiFeeReceiver: '0x0000000000000000000000000000000000000000',
      market: market.marketToken,
    });
    expect(params.addresses.longTokenSwapPath).toEqual([]);
    expect(params.addresses.shortTokenSwapPath).toEqual([]);
    expect(params.minLongTokenAmount).toBe(0n);
    expect(params.minShortTokenAmount).toBe(0n);
    expect(params.shouldUnwrapNativeToken).toBe(false);
    expect(params.executionFee).toBe(BigInt(GMX_V2_EXECUTION_FEE_WEI));
    expect(params.callbackGasLimit).toBe(0n);
    expect(params.dataList).toEqual([]);
  });

  it.each(Object.entries(GMX_V2_MARKETS))(
    'encodes the %s createWithdrawal multicall (sendWnt + sendTokens + createWithdrawal)',
    (_key, market) => {
      const gmAmount = 5_000n;
      const { data, value } = encodeGmxV2CreateWithdrawalMulticall({
        receiver: USER,
        market,
        gmTokenAmount: gmAmount,
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
        GMX_V2_ADDRESSES.withdrawalVault,
        BigInt(GMX_V2_EXECUTION_FEE_WEI),
      ]);

      // The GM market token itself is sent to the WithdrawalVault to be burned.
      const sendTokens = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[1]!,
      });
      expect(sendTokens.functionName).toBe('sendTokens');
      expect(sendTokens.args).toEqual([
        market.marketToken,
        GMX_V2_ADDRESSES.withdrawalVault,
        gmAmount,
      ]);

      const createWithdrawal = decodeFunctionData({
        abi: GMX_V2_EXCHANGE_ROUTER_ABI,
        data: calls[2]!,
      });
      expect(createWithdrawal.functionName).toBe('createWithdrawal');
      const [params] = createWithdrawal.args as unknown as [
        {
          addresses: { receiver: Address; market: Address };
          executionFee: bigint;
        },
      ];
      expect(params.addresses.receiver).toBe(USER);
      expect(params.addresses.market).toBe(market.marketToken);
      expect(params.executionFee).toBe(BigInt(GMX_V2_EXECUTION_FEE_WEI));
    },
  );

  it('rejects a withdrawal multicall with zero GM amount', () => {
    expect(() =>
      encodeGmxV2CreateWithdrawalMulticall({
        receiver: USER,
        market: GMX_V2_MARKETS['btc-usdc'],
        gmTokenAmount: 0n,
      }),
    ).toThrow('GMX withdrawal amount must be greater than zero');
  });

  it.each(['btc-btc', 'eth-eth'] as const)(
    'funds the single-collateral %s market with one transfer',
    (key) => {
      // The DepositVault books a token's whole balance change to the first
      // side naming it, so one transfer funds both sides of a market whose
      // long and short token are the same. Verified by a keeper execution on
      // an Arbitrum fork (docs/gmx-v2-implementation-notes.md).
      const market = GMX_V2_MARKETS[key];
      const { data } = encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market,
        initialToken: market.longToken,
        amount: 1_491n,
        side: 'long',
        minMarketTokens: MIN_MARKET_TOKENS,
      });

      const { calls, params } = decodeMulticall(data);
      expect(calls.map((call) => call.functionName)).toEqual([
        'sendWnt',
        'sendTokens',
        'createDeposit',
      ]);
      expect(calls[1]!.args).toEqual([
        market.longToken,
        GMX_V2_ADDRESSES.depositVault,
        1_491n,
      ]);
      expect(params.addresses.initialLongToken).toBe(market.longToken);
      expect(params.addresses.initialShortToken).toBe(market.shortToken);
      expect(params.addresses.longTokenSwapPath).toEqual([]);
      expect(params.addresses.shortTokenSwapPath).toEqual([]);
    },
  );

  it('sends USDC into btc-btc and lets the keeper swap it through btc-usdc', () => {
    const market = GMX_V2_MARKETS['btc-btc'];
    const hop = GMX_V2_MARKETS['btc-usdc'].marketToken;
    const { data, value } = encodeGmxV2CreateDepositMulticall({
      receiver: USER,
      market,
      initialToken: GMX_V2_TOKENS.USDC.address,
      amount: 53_200n,
      side: 'long',
      swapPath: [hop],
      minMarketTokens: MIN_MARKET_TOKENS,
    });

    expect(value).toBe(GMX_V2_EXECUTION_FEE_WEI);
    const { calls, params } = decodeMulticall(data);
    expect(calls[1]!.args).toEqual([
      GMX_V2_TOKENS.USDC.address,
      GMX_V2_ADDRESSES.depositVault,
      53_200n,
    ]);
    expect(params.addresses).toMatchObject({
      market: market.marketToken,
      initialLongToken: GMX_V2_TOKENS.USDC.address,
      // The unfunded side names the pool token itself: its zero amount skips
      // the swap, and any other token cancels the deposit at execution with
      // InvalidSwapOutputToken.
      initialShortToken: market.shortToken,
      longTokenSwapPath: [hop],
      shortTokenSwapPath: [],
    });
  });

  it('routes a swapped short-side deposit through the short swap path', () => {
    const market = GMX_V2_MARKETS['btc-usdc'];
    const hop = GMX_V2_MARKETS['eth-usdc'].marketToken;
    const { data, value } = encodeGmxV2CreateDepositMulticall({
      receiver: USER,
      market,
      initialToken: GMX_V2_TOKENS.WETH.address,
      amount: 20_000_000_000_000n,
      side: 'short',
      swapPath: [hop],
      minMarketTokens: MIN_MARKET_TOKENS,
      useNativeWntCollateral: true,
    });

    expect(value).toBe(
      (BigInt(GMX_V2_EXECUTION_FEE_WEI) + 20_000_000_000_000n).toString(),
    );
    const { calls, params } = decodeMulticall(data);
    expect(calls.map((call) => call.functionName)).toEqual([
      'sendWnt',
      'sendWnt',
      'createDeposit',
    ]);
    expect(params.addresses).toMatchObject({
      initialLongToken: market.longToken,
      initialShortToken: GMX_V2_TOKENS.WETH.address,
      longTokenSwapPath: [],
      shortTokenSwapPath: [hop],
    });
  });

  it('rejects a token that is not the pool token without a swap path', () => {
    expect(() =>
      encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market: GMX_V2_MARKETS['btc-btc'],
        initialToken: GMX_V2_TOKENS.USDC.address,
        amount: 53_200n,
        side: 'long',
        minMarketTokens: MIN_MARKET_TOKENS,
      }),
    ).toThrow(
      'GMX deposit token must be the funded pool token unless a swap path converts it',
    );
  });
});
