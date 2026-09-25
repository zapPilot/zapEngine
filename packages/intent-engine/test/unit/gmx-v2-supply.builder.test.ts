import { describe, expect, it, vi } from 'vitest';
import {
  decodeFunctionData,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import type { GmxV2PricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildGmxV2SupplyTx as buildGmxV2SupplyTxRaw } from '../../src/builders/gmx-v2-supply.builder.js';
import { GmxDepositTooSmallError } from '../../src/errors/intent.errors.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';
import {
  PreparedTransactionSchema,
  type TransactionQuote,
} from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const LIFI_APPROVAL = '0x2222222222222222222222222222222222222222' as Address;
const LIFI_TX_TARGET = '0x3333333333333333333333333333333333333333' as Address;
const USDC_AMOUNT = '1000000';
const SWAPPED_MIN = '12345';
const NATIVE_ETH = GMX_V2_TOKENS.ETH.address;
const PUBLIC_CLIENT = {} as PublicClient;
const GMX_READER_OUTPUT = 500000000000000000n;

function buildGmxV2SupplyTx(
  input: Parameters<typeof buildGmxV2SupplyTxRaw>[0],
  adapter: LiFiAdapter,
) {
  return buildGmxV2SupplyTxRaw(
    input,
    adapter,
    PUBLIC_CLIENT,
    makePricingAdapter().pricingAdapter,
  );
}

function makePricingAdapter() {
  const getDepositAmountOut = vi.fn().mockResolvedValue(GMX_READER_OUTPUT);
  return {
    pricingAdapter: { getDepositAmountOut } as GmxV2PricingAdapter,
    getDepositAmountOut,
  };
}

function makeSwapQuote(params: {
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
}): TransactionQuote {
  const nativeFunding = params.fromToken.toLowerCase() === NATIVE_ETH;
  return {
    transaction: {
      to: LIFI_TX_TARGET,
      data: '0x1234',
      value: '0',
      chainId: GMX_V2_ARBITRUM_CHAIN_ID,
      gasLimit: '300000',
      meta: {
        intentType: 'SWAP',
        route: { tool: 'lifi' },
      },
    },
    estimate: {
      fromAmount: params.fromAmount,
      toAmount: '13000',
      toAmountMin: SWAPPED_MIN,
      gasCostUsd: '0.02',
      executionDuration: 30,
    },
    ...(nativeFunding
      ? {}
      : {
          approval: {
            tokenAddress: params.fromToken,
            spenderAddress: LIFI_APPROVAL,
            amount: params.fromAmount,
          },
        }),
    route: {
      action: {
        fromToken: { address: params.fromToken },
        toToken: { address: params.toToken },
      },
    },
  };
}

function makeAdapter() {
  const getSwapQuote = vi
    .fn()
    .mockImplementation(
      ({
        fromToken,
        toToken,
        fromAmount,
      }: {
        fromToken: Address;
        toToken: Address;
        fromAmount: string;
      }) => Promise.resolve(makeSwapQuote({ fromToken, toToken, fromAmount })),
    );

  const getTokenPrice = vi
    .fn()
    .mockImplementation((_chainId: number, tokenAddress: string) => {
      const normalized = tokenAddress.toLowerCase();
      if (
        normalized === GMX_V2_TOKENS.USDC.address.toLowerCase() ||
        normalized === GMX_V2_TOKENS.USDT.address.toLowerCase()
      ) {
        return Promise.resolve({
          address: tokenAddress,
          symbol: 'USD',
          decimals: 6,
          priceUSD: '1',
        });
      }
      if (normalized === GMX_V2_TOKENS.WBTC_B.address.toLowerCase()) {
        return Promise.resolve({
          address: tokenAddress,
          symbol: 'WBTC',
          decimals: 8,
          priceUSD: '60000',
        });
      }
      if (normalized === GMX_V2_TOKENS.WETH.address.toLowerCase()) {
        return Promise.resolve({
          address: tokenAddress,
          symbol: 'WETH',
          decimals: 18,
          priceUSD: '3000',
        });
      }
      return Promise.resolve({
        address: tokenAddress,
        symbol: 'GM',
        decimals: 18,
        priceUSD: '2',
      });
    });

  return {
    adapter: { getSwapQuote, getTokenPrice } as unknown as LiFiAdapter,
    getSwapQuote,
    getTokenPrice,
  };
}

function decodeApproval(data: Hex) {
  const decoded = decodeFunctionData({ abi: erc20Abi, data });
  expect(decoded.functionName).toBe('approve');
  return decoded.args;
}

function decodeMulticallSendTokens(data: Hex) {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  const calls = decoded.args[0] as Hex[];
  const sendTokens = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data: calls[1]!,
  });
  expect(sendTokens.functionName).toBe('sendTokens');
  return sendTokens.args;
}

function decodeMulticallSendTokensList(
  data: Hex,
): ReadonlyArray<readonly [Address, Address, bigint]> {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  const calls = decoded.args[0] as Hex[];
  return calls
    .map((call) =>
      decodeFunctionData({ abi: GMX_V2_EXCHANGE_ROUTER_ABI, data: call }),
    )
    .filter((d) => d.functionName === 'sendTokens')
    .map((d) => d.args as readonly [Address, Address, bigint]);
}

function decodeMulticallSendWntList(
  data: Hex,
): ReadonlyArray<readonly [Address, bigint]> {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  const calls = decoded.args[0] as Hex[];
  return calls
    .map((call) =>
      decodeFunctionData({ abi: GMX_V2_EXCHANGE_ROUTER_ABI, data: call }),
    )
    .filter((d) => d.functionName === 'sendWnt')
    .map((d) => d.args as readonly [Address, bigint]);
}

function decodeCreateDepositAddresses(data: Hex) {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  const calls = decoded.args[0] as Hex[];
  const createDeposit = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data: calls.at(-1)!,
  });
  expect(createDeposit.functionName).toBe('createDeposit');
  const [params] = createDeposit.args as unknown as [
    {
      addresses: {
        initialLongToken: Address;
        initialShortToken: Address;
        longTokenSwapPath: readonly Address[];
        shortTokenSwapPath: readonly Address[];
      };
    },
  ];
  return params.addresses;
}

function decodeMulticallMinMarketTokens(data: Hex): bigint {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  const calls = decoded.args[0] as Hex[];
  const createDeposit = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data: calls.at(-1)!,
  });
  expect(createDeposit.functionName).toBe('createDeposit');
  const [params] = createDeposit.args as unknown as [
    { minMarketTokens: bigint },
  ];
  return params.minMarketTokens;
}

describe('buildGmxV2SupplyTx', () => {
  it.each(['btc-usdc', 'eth-usdc'] as const)(
    'builds a direct USDC deposit plan for %s without a swap',
    async (marketKey) => {
      const { adapter, getSwapQuote } = makeAdapter();

      const plan = await buildGmxV2SupplyTx(
        {
          marketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      );

      expect(getSwapQuote).not.toHaveBeenCalled();
      expect(plan.market.key).toBe(marketKey);
      expect(plan.executionFeeWei).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(plan.approvals).toHaveLength(1);
      expect(plan.steps).toHaveLength(1);

      const [spender, amount] = decodeApproval(plan.approvals[0]!.data as Hex);
      expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.USDC.address);
      expect(spender).toBe(GMX_V2_ADDRESSES.router);
      expect(amount).toBe(BigInt(USDC_AMOUNT));

      const deposit = plan.steps[0]!;
      expect(deposit.to).toBe(GMX_V2_ADDRESSES.exchangeRouter);
      expect(deposit.value).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(deposit.meta.route).toMatchObject({
        marketKey,
        swapPath: [],
        executionFeeWei: GMX_V2_EXECUTION_FEE_WEI,
      });
      expect(plan.estimatedMarketTokens).toBe('500000000000000000');
      expect(plan.minMarketTokens).toBe('495000000000000000');
      expect(decodeMulticallMinMarketTokens(deposit.data as Hex)).toBe(
        BigInt(plan.minMarketTokens),
      );

      expect(decodeMulticallSendTokensList(deposit.data as Hex)).toHaveLength(
        1,
      );
      const [fundedToken, receiver, fundedAmount] = decodeMulticallSendTokens(
        deposit.data as Hex,
      );
      expect(fundedToken).toBe(GMX_V2_TOKENS.USDC.address);
      expect(receiver).toBe(GMX_V2_ADDRESSES.depositVault);
      expect(fundedAmount).toBe(BigInt(USDC_AMOUNT));

      for (const tx of [...plan.approvals, ...plan.steps]) {
        expect(PreparedTransactionSchema.parse(tx)).toEqual(tx);
        expect(tx.chainId).toBe(GMX_V2_ARBITRUM_CHAIN_ID);
      }
      expect(plan.steps.filter((step) => step.value !== '0')).toHaveLength(1);
    },
  );

  it.each([
    ['btc-btc', 'btc-usdc'],
    ['eth-eth', 'eth-usdc'],
  ] as const)(
    'funds %s with USDC swapped by GMX through %s, not LI.FI',
    async (marketKey, hopKey) => {
      const { adapter, getSwapQuote } = makeAdapter();
      const { pricingAdapter, getDepositAmountOut } = makePricingAdapter();
      const market = GMX_V2_MARKETS[marketKey];
      const hop = GMX_V2_MARKETS[hopKey];

      const plan = await buildGmxV2SupplyTxRaw(
        {
          marketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
        PUBLIC_CLIENT,
        pricingAdapter,
      );

      expect(getSwapQuote).not.toHaveBeenCalled();
      // The mint is quoted after the same swap the keeper will run.
      expect(getDepositAmountOut).toHaveBeenCalledWith({
        publicClient: PUBLIC_CLIENT,
        market,
        initialToken: GMX_V2_TOKENS.USDC.address,
        amount: BigInt(USDC_AMOUNT),
        side: 'long',
        swapPath: [hop],
      });

      // One approval (USDC to the GMX router) and one GMX multicall.
      expect(plan.approvals).toHaveLength(1);
      expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.USDC.address);
      const [spender, approved] = decodeApproval(
        plan.approvals[0]!.data as Hex,
      );
      expect(spender).toBe(GMX_V2_ADDRESSES.router);
      expect(approved).toBe(BigInt(USDC_AMOUNT));
      expect(plan.steps).toHaveLength(1);

      const deposit = plan.steps[0]!;
      expect(deposit.to).toBe(GMX_V2_ADDRESSES.exchangeRouter);
      expect(deposit.value).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(deposit.meta.route).toMatchObject({
        marketKey,
        swapPath: [hopKey],
      });
      expect(decodeMulticallSendTokensList(deposit.data as Hex)).toEqual([
        [
          GMX_V2_TOKENS.USDC.address,
          GMX_V2_ADDRESSES.depositVault,
          BigInt(USDC_AMOUNT),
        ],
      ]);
      expect(decodeCreateDepositAddresses(deposit.data as Hex)).toEqual({
        receiver: USER,
        callbackContract: '0x0000000000000000000000000000000000000000',
        uiFeeReceiver: '0x0000000000000000000000000000000000000000',
        market: market.marketToken,
        initialLongToken: GMX_V2_TOKENS.USDC.address,
        initialShortToken: market.shortToken,
        longTokenSwapPath: [hop.marketToken],
        shortTokenSwapPath: [],
      });
    },
  );

  it('builds the cent-sized btc-btc basket leg a LI.FI swap could not', async () => {
    // Stable 99% / Crypto 1% at the $10.64 minimum leaves ~$0.0532 per pool.
    // As a LI.FI USDC→WBTC.b swap that is a two-digit sat amount whose 0.5%
    // buffer rounds to zero, so the builder had to refuse it. Swapped inside
    // the GMX deposit, only the 18-decimal GM mint carries a slippage floor.
    const { adapter, getSwapQuote } = makeAdapter();
    const pricingAdapter: GmxV2PricingAdapter = {
      getDepositAmountOut: vi.fn().mockResolvedValue(39_620_920_784_108_956n),
    };

    const plan = await buildGmxV2SupplyTxRaw(
      {
        marketKey: 'btc-btc',
        fromToken: GMX_V2_TOKENS.USDC.address,
        fromAmount: '53200',
        userAddress: USER,
      },
      adapter,
      PUBLIC_CLIENT,
      pricingAdapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.minMarketTokens).toBe('39224711576267867');
    expect(decodeMulticallSendTokensList(plan.steps[0]!.data as Hex)).toEqual([
      [GMX_V2_TOKENS.USDC.address, GMX_V2_ADDRESSES.depositVault, 53_200n],
    ]);
  });

  it('uses native ETH directly for the WETH side of eth-usdc', async () => {
    const { adapter, getSwapQuote } = makeAdapter();
    const fromAmount = '1000000000000000';

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'eth-usdc',
        fromToken: NATIVE_ETH,
        fromAmount,
        userAddress: USER,
      },
      adapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.approvals).toHaveLength(0);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.value).toBe(
      (BigInt(fromAmount) + BigInt(GMX_V2_EXECUTION_FEE_WEI)).toString(),
    );
    expect(
      decodeMulticallSendTokensList(plan.steps[0]!.data as Hex),
    ).toHaveLength(0);
    expect(decodeMulticallSendWntList(plan.steps[0]!.data as Hex)).toEqual([
      [GMX_V2_ADDRESSES.depositVault, BigInt(GMX_V2_EXECUTION_FEE_WEI)],
      [GMX_V2_ADDRESSES.depositVault, BigInt(fromAmount)],
    ]);
    expect(
      decodeCreateDepositAddresses(plan.steps[0]!.data as Hex),
    ).toMatchObject({
      initialLongToken: GMX_V2_TOKENS.WETH.address,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
    });
  });

  it('uses WETH directly for the WETH side of eth-usdc', async () => {
    const { adapter, getSwapQuote } = makeAdapter();

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'eth-usdc',
        fromToken: GMX_V2_TOKENS.WETH.address,
        fromAmount: USDC_AMOUNT,
        userAddress: USER,
      },
      adapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.approvals).toHaveLength(1);
    expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.WETH.address);
    const sends = decodeMulticallSendTokensList(plan.steps[0]!.data as Hex);
    expect(sends).toEqual([
      [
        GMX_V2_TOKENS.WETH.address,
        GMX_V2_ADDRESSES.depositVault,
        BigInt(USDC_AMOUNT),
      ],
    ]);
  });

  it.each([
    ['native ETH', NATIVE_ETH, 0],
    ['WETH', GMX_V2_TOKENS.WETH.address, 1],
  ] as const)(
    'swaps %s into the USDC side of btc-usdc through eth-usdc',
    async (_label, fromToken, approvalCount) => {
      const { adapter, getSwapQuote } = makeAdapter();
      const { pricingAdapter, getDepositAmountOut } = makePricingAdapter();

      const plan = await buildGmxV2SupplyTxRaw(
        {
          marketKey: 'btc-usdc',
          fromToken: getAddress(fromToken),
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
        PUBLIC_CLIENT,
        pricingAdapter,
      );

      expect(getSwapQuote).not.toHaveBeenCalled();
      // One hop into USDC beats two into WBTC.b.
      expect(getDepositAmountOut).toHaveBeenCalledWith(
        expect.objectContaining({
          initialToken: GMX_V2_TOKENS.WETH.address,
          side: 'short',
          swapPath: [GMX_V2_MARKETS['eth-usdc']],
        }),
      );
      expect(plan.approvals).toHaveLength(approvalCount);
      expect(plan.steps.map((step) => step.meta.intentType)).toEqual([
        'SUPPLY',
      ]);
      expect(
        decodeCreateDepositAddresses(plan.steps[0]!.data as Hex),
      ).toMatchObject({
        initialLongToken: GMX_V2_MARKETS['btc-usdc'].longToken,
        initialShortToken: GMX_V2_TOKENS.WETH.address,
        longTokenSwapPath: [],
        shortTokenSwapPath: [GMX_V2_MARKETS['eth-usdc'].marketToken],
      });
    },
  );

  it('swaps native ETH into btc-btc through eth-usdc then btc-usdc', async () => {
    const { adapter, getSwapQuote } = makeAdapter();
    const fromAmount = '20000000000000';

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'btc-btc',
        fromToken: NATIVE_ETH,
        fromAmount,
        userAddress: USER,
      },
      adapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.approvals).toHaveLength(0);
    const deposit = plan.steps[0]!;
    expect(deposit.value).toBe(
      (BigInt(fromAmount) + BigInt(GMX_V2_EXECUTION_FEE_WEI)).toString(),
    );
    expect(deposit.meta.route).toMatchObject({
      swapPath: ['eth-usdc', 'btc-usdc'],
    });
    expect(decodeCreateDepositAddresses(deposit.data as Hex)).toMatchObject({
      initialLongToken: GMX_V2_TOKENS.WETH.address,
      initialShortToken: GMX_V2_TOKENS.WBTC_B.address,
      longTokenSwapPath: [
        GMX_V2_MARKETS['eth-usdc'].marketToken,
        GMX_V2_MARKETS['btc-usdc'].marketToken,
      ],
      shortTokenSwapPath: [],
    });
  });

  it.each(['btc-usdc', 'eth-usdc'] as const)(
    'converts USDT to USDC through LI.FI before a direct %s deposit',
    async (marketKey) => {
      const { adapter, getSwapQuote } = makeAdapter();

      const plan = await buildGmxV2SupplyTx(
        {
          marketKey,
          fromToken: GMX_V2_TOKENS.USDT.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      );

      expect(getSwapQuote).toHaveBeenCalledWith({
        fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
        toChain: GMX_V2_ARBITRUM_CHAIN_ID,
        fromToken: getAddress(GMX_V2_TOKENS.USDT.address),
        toToken: GMX_V2_TOKENS.USDC.address,
        fromAmount: USDC_AMOUNT,
        fromAddress: USER,
        toAddress: USER,
        slippageBps: 50,
      });
      expect(plan.steps.map((step) => step.meta.intentType)).toEqual([
        'SWAP',
        'SUPPLY',
      ]);
      expect(decodeMulticallSendTokensList(plan.steps[1]!.data as Hex)).toEqual(
        [
          [
            GMX_V2_TOKENS.USDC.address,
            GMX_V2_ADDRESSES.depositVault,
            BigInt(SWAPPED_MIN),
          ],
        ],
      );
      expect(
        decodeMulticallMinMarketTokens(plan.steps.at(-1)!.data as Hex),
      ).toBe(BigInt(plan.minMarketTokens));
    },
  );

  it('converts USDT to USDC through LI.FI, then swaps it into btc-btc through GMX', async () => {
    const { adapter } = makeAdapter();

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'btc-btc',
        fromToken: GMX_V2_TOKENS.USDT.address,
        fromAmount: USDC_AMOUNT,
        userAddress: USER,
      },
      adapter,
    );

    expect(plan.approvals.map((approval) => approval.to)).toEqual([
      getAddress(GMX_V2_TOKENS.USDT.address),
      GMX_V2_TOKENS.USDC.address,
    ]);
    expect(decodeApproval(plan.approvals[0]!.data as Hex)).toEqual([
      LIFI_APPROVAL,
      BigInt(USDC_AMOUNT),
    ]);
    // The GMX leg spends only the swap's floor, never the full quote.
    expect(decodeApproval(plan.approvals[1]!.data as Hex)).toEqual([
      GMX_V2_ADDRESSES.router,
      BigInt(SWAPPED_MIN),
    ]);
    expect(plan.steps[0]!.to).toBe(LIFI_TX_TARGET);
    expect(
      decodeCreateDepositAddresses(plan.steps[1]!.data as Hex),
    ).toMatchObject({
      initialLongToken: GMX_V2_TOKENS.USDC.address,
      longTokenSwapPath: [GMX_V2_MARKETS['btc-usdc'].marketToken],
    });
  });

  it('funds eth-eth with a single native ETH transfer and no approval', async () => {
    const { adapter, getSwapQuote } = makeAdapter();
    const fromAmount = '1000000000000000';

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'eth-eth',
        fromToken: NATIVE_ETH,
        fromAmount,
        userAddress: USER,
      },
      adapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.approvals).toHaveLength(0);
    expect(plan.steps).toHaveLength(1);

    const deposit = plan.steps[0]!;
    expect(deposit.value).toBe(
      (BigInt(fromAmount) + BigInt(GMX_V2_EXECUTION_FEE_WEI)).toString(),
    );
    expect(decodeMulticallSendTokensList(deposit.data as Hex)).toHaveLength(0);
    expect(decodeMulticallSendWntList(deposit.data as Hex)).toEqual([
      [GMX_V2_ADDRESSES.depositVault, BigInt(GMX_V2_EXECUTION_FEE_WEI)],
      [GMX_V2_ADDRESSES.depositVault, BigInt(fromAmount)],
    ]);
  });

  it('treats WETH as normal ERC-20 collateral for eth-eth', async () => {
    const { adapter, getSwapQuote } = makeAdapter();

    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'eth-eth',
        fromToken: GMX_V2_TOKENS.WETH.address,
        fromAmount: USDC_AMOUNT,
        userAddress: USER,
      },
      adapter,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.approvals).toHaveLength(1);
    expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.WETH.address);
    expect(plan.steps[0]!.value).toBe(GMX_V2_EXECUTION_FEE_WEI);
    expect(decodeMulticallSendTokensList(plan.steps[0]!.data as Hex)).toEqual([
      [
        GMX_V2_TOKENS.WETH.address,
        GMX_V2_ADDRESSES.depositVault,
        BigInt(USDC_AMOUNT),
      ],
    ]);
  });

  it('rejects non-canonical Arbitrum funding tokens before quoting', async () => {
    const { adapter, getSwapQuote } = makeAdapter();

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'eth-usdc',
          fromToken: '0x4444444444444444444444444444444444444444',
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      ),
    ).rejects.toThrow('canonical Arbitrum USDC, USDT, native ETH, or WETH');
    expect(getSwapQuote).not.toHaveBeenCalled();
  });

  it('supports a tighter GM-token slippage bound', async () => {
    const { adapter } = makeAdapter();
    const plan = await buildGmxV2SupplyTx(
      {
        marketKey: 'eth-usdc',
        fromToken: GMX_V2_TOKENS.USDC.address,
        fromAmount: USDC_AMOUNT,
        userAddress: USER,
        slippageBps: 50,
      },
      adapter,
    );

    expect(plan.estimatedMarketTokens).toBe('500000000000000000');
    expect(plan.minMarketTokens).toBe('497500000000000000');
  });

  it('rejects zero deposit amounts', async () => {
    const { adapter } = makeAdapter();

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'eth-usdc' as GmxV2MarketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: '0',
          userAddress: USER,
        },
        adapter,
      ),
    ).rejects.toThrow('GMX deposit amount must be greater than zero');
  });

  it.each([
    ['15', '15'],
    // A floor of zero: the swap rounds the whole deposit away.
    ['1', '0'],
  ] as const)(
    'rejects USDT dust whose LI.FI swap output (%s, min %s) has no slippage buffer',
    async (toAmount, toAmountMin) => {
      // A swap floor equal to its quote leaves zero tolerance, so the on-chain
      // swap reverts on any execution rounding and takes the whole EIP-7702
      // atomic batch with it. See docs/gmx-v2-implementation-notes.md (Gate 2).
      const getSwapQuote = vi.fn().mockResolvedValue({
        ...makeSwapQuote({
          fromToken: GMX_V2_TOKENS.USDT.address,
          toToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: USDC_AMOUNT,
        }),
        estimate: {
          fromAmount: USDC_AMOUNT,
          toAmount,
          toAmountMin,
          gasCostUsd: '0.02',
          executionDuration: 30,
        },
      });
      const adapter = { getSwapQuote } as unknown as LiFiAdapter;

      // Typed, so plan-orchestration can answer 422 with a code the app
      // explains instead of a 500 carrying this raw text.
      await expect(
        buildGmxV2SupplyTx(
          {
            marketKey: 'btc-btc',
            fromToken: GMX_V2_TOKENS.USDT.address,
            fromAmount: USDC_AMOUNT,
            userAddress: USER,
          },
          adapter,
        ),
      ).rejects.toBeInstanceOf(GmxDepositTooSmallError);
    },
  );
});
