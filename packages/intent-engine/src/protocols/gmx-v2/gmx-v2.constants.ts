import {
  CANONICAL_TOKEN_ADDRESSES,
  NATIVE_TOKEN_ADDRESS,
  TOKEN_METADATA,
} from '@zapengine/types/shared';
import type { Address } from 'viem';

export const GMX_V2_ARBITRUM_CHAIN_ID = 42161;

/**
 * GMX redeploys its handlers and ExchangeRouter and revokes the old router's
 * roles, so a stale exchangeRouter reverts every deposit and withdrawal. The
 * vaults, DataStore, and Router (the approval spender) survive upgrades.
 * Re-check the router with RoleStore.hasRole(exchangeRouter, CONTROLLER) —
 * see docs/gmx-v2-implementation-notes.md.
 */
export const GMX_V2_ADDRESSES = {
  exchangeRouter: '0x7dE39FF2e232A2203196788d37e234cF8F1b83f1',
  depositVault: '0xF89e77e8Dc11691C9e8757e84aaFbCD8A67d7A55',
  withdrawalVault: '0x0628D46b5D145f183AdB6Ef1f2c97eD1C4701C55',
  dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  syntheticsReader: '0xfA26cBb46e2614609406de08CA1Dc7f70a684184',
  router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6',
} as const satisfies Record<string, Address>;

export const GMX_V2_TOKENS = {
  USDC: {
    address: CANONICAL_TOKEN_ADDRESSES[42161].USDC,
    symbol: 'USDC',
    decimals: TOKEN_METADATA.USDC.decimals,
  },
  USDT: {
    address: CANONICAL_TOKEN_ADDRESSES[42161].USDT,
    symbol: 'USDT',
    decimals: TOKEN_METADATA.USDT.decimals,
  },
  ETH: {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    decimals: TOKEN_METADATA.ETH.decimals,
  },
  WETH: {
    address: CANONICAL_TOKEN_ADDRESSES[42161].WETH,
    symbol: 'WETH',
    decimals: TOKEN_METADATA.WETH.decimals,
  },
  WBTC_B: {
    address: CANONICAL_TOKEN_ADDRESSES[42161].WBTC,
    symbol: 'WBTC.b',
    decimals: TOKEN_METADATA.WBTC.decimals,
  },
} as const satisfies Record<
  string,
  {
    readonly address: Address;
    readonly symbol: string;
    readonly decimals: number;
  }
>;

/** Canonical Arbitrum funding assets accepted by the public GMX builder. */
export const GMX_V2_FUNDING_TOKENS = [
  GMX_V2_TOKENS.USDC.address,
  GMX_V2_TOKENS.USDT.address,
  GMX_V2_TOKENS.ETH.address,
  GMX_V2_TOKENS.WETH.address,
] as const satisfies readonly Address[];

/** One-percent protection for the asynchronous GM-token mint quote. */
export const GMX_V2_DEFAULT_DEPOSIT_SLIPPAGE_BPS = 100;

/** The market side a deposit's funding token enters. */
export type GmxV2FundedSide = 'long' | 'short';

export interface GmxV2Market {
  readonly key: GmxV2MarketKey;
  readonly name: string;
  readonly marketToken: Address;
  readonly indexToken: Address;
  readonly longToken: Address;
  readonly shortToken: Address;
  /** The market's representative pool token, reported as a withdrawal's output. */
  readonly collateralToken: Address;
}

export type GmxV2MarketKey = 'btc-btc' | 'eth-eth' | 'btc-usdc' | 'eth-usdc';

/**
 * The strategy's GMX basket: pure BTC and ETH exposure. The USDC-collateral
 * markets stay fully supported (single-market deposits, withdrawals, existing
 * holdings) but are deliberately left out of the basket.
 */
export const GMX_V2_BASKET_MARKET_KEYS = [
  'btc-btc',
  'eth-eth',
] as const satisfies readonly GmxV2MarketKey[];

export const GMX_V2_MARKETS = {
  'btc-usdc': {
    key: 'btc-usdc',
    name: 'GM BTC/USD [WBTC.b-USDC]',
    marketToken: '0x47c031236e19d024b42f8AE6780E44A573170703',
    indexToken: '0x47904963fc8b2340414262125aF798B9655E58Cd',
    longToken: GMX_V2_TOKENS.WBTC_B.address,
    shortToken: GMX_V2_TOKENS.USDC.address,
    collateralToken: GMX_V2_TOKENS.USDC.address,
  },
  'eth-usdc': {
    key: 'eth-usdc',
    name: 'GM ETH/USD [WETH-USDC]',
    marketToken: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
    indexToken: GMX_V2_TOKENS.WETH.address,
    longToken: GMX_V2_TOKENS.WETH.address,
    shortToken: GMX_V2_TOKENS.USDC.address,
    collateralToken: GMX_V2_TOKENS.USDC.address,
  },
  'btc-btc': {
    key: 'btc-btc',
    name: 'GM BTC/USD [WBTC.b-WBTC.b]',
    marketToken: '0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77',
    indexToken: '0x47904963fc8b2340414262125aF798B9655E58Cd',
    longToken: GMX_V2_TOKENS.WBTC_B.address,
    shortToken: GMX_V2_TOKENS.WBTC_B.address,
    collateralToken: GMX_V2_TOKENS.WBTC_B.address,
  },
  'eth-eth': {
    key: 'eth-eth',
    name: 'GM ETH/USD [WETH-WETH]',
    marketToken: '0x450bb6774Dd8a756274E0ab4107953259d2ac541',
    indexToken: GMX_V2_TOKENS.WETH.address,
    longToken: GMX_V2_TOKENS.WETH.address,
    shortToken: GMX_V2_TOKENS.WETH.address,
    collateralToken: GMX_V2_TOKENS.WETH.address,
  },
} as const satisfies Record<GmxV2MarketKey, GmxV2Market>;

/**
 * Swap paths GMX's keeper runs before minting, for a funding token that is not
 * the target pool's own token. Every hop is one of the deep two-token markets
 * (btc-usdc: WBTC.b<->USDC, eth-usdc: WETH<->USDC), so the only slippage bound
 * is the 18-decimal minMarketTokens and a leg of a few cents still mints. USDT
 * has no path on purpose: GMX's only USDT market (swap-only USDC/USDT, market
 * 0xB686…c4) held ~2.8k USDC on 2026-09-25, so USDT enters as USDC through
 * LI.FI first. Each path was executed by a keeper on an Arbitrum fork — see
 * docs/gmx-v2-implementation-notes.md.
 */
export const GMX_V2_SWAP_PATHS = [
  {
    from: GMX_V2_TOKENS.USDC.address,
    to: GMX_V2_TOKENS.WBTC_B.address,
    via: ['btc-usdc'],
  },
  {
    from: GMX_V2_TOKENS.USDC.address,
    to: GMX_V2_TOKENS.WETH.address,
    via: ['eth-usdc'],
  },
  {
    from: GMX_V2_TOKENS.WETH.address,
    to: GMX_V2_TOKENS.USDC.address,
    via: ['eth-usdc'],
  },
  {
    from: GMX_V2_TOKENS.WETH.address,
    to: GMX_V2_TOKENS.WBTC_B.address,
    via: ['eth-usdc', 'btc-usdc'],
  },
] as const satisfies readonly {
  readonly from: Address;
  readonly to: Address;
  readonly via: readonly GmxV2MarketKey[];
}[];

export const GMX_V2_EXECUTION_FEE_WEI = '1000000000000000';

export const GMX_V2_ORACLE_URLS = [
  'https://arbitrum-api.gmxinfra.io/prices/tickers',
  'https://arbitrum-api-fallback.gmxinfra.io/prices/tickers',
  'https://arbitrum-api-fallback.gmxinfra2.io/prices/tickers',
] as const;

export const GMX_V2_GAS_ESTIMATES = {
  approve: '60000',
  multicall: '1200000',
  withdrawalMulticall: '1200000',
} as const;

const ADDRESS = 'address';
const UINT256 = 'uint256';
const BYTES32 = 'bytes32';

interface GmxV2AbiInput {
  readonly name: string;
  readonly type: string;
}

function payableFunctionAbi<
  const TName extends string,
  const TInputs extends readonly GmxV2AbiInput[],
>(name: TName, inputs: TInputs) {
  return {
    name,
    type: 'function',
    stateMutability: 'payable',
    inputs,
    outputs: [],
  } as const;
}

const PRICE_COMPONENTS = [
  { name: 'min', type: UINT256 },
  { name: 'max', type: UINT256 },
] as const;

const READER_MARKET_INPUT = {
  name: 'market',
  type: 'tuple',
  components: [
    { name: 'marketToken', type: ADDRESS },
    { name: 'indexToken', type: ADDRESS },
    { name: 'longToken', type: ADDRESS },
    { name: 'shortToken', type: ADDRESS },
  ],
} as const;

const READER_PRICES_INPUT = {
  name: 'prices',
  type: 'tuple',
  components: [
    { name: 'indexTokenPrice', type: 'tuple', components: PRICE_COMPONENTS },
    { name: 'longTokenPrice', type: 'tuple', components: PRICE_COMPONENTS },
    { name: 'shortTokenPrice', type: 'tuple', components: PRICE_COMPONENTS },
  ],
} as const;

export const GMX_V2_READER_ABI = [
  {
    name: 'getDepositAmountOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dataStore', type: ADDRESS },
      READER_MARKET_INPUT,
      READER_PRICES_INPUT,
      { name: 'longTokenAmount', type: UINT256 },
      { name: 'shortTokenAmount', type: UINT256 },
      { name: 'uiFeeReceiver', type: ADDRESS },
      { name: 'swapPricingType', type: 'uint8' },
      { name: 'includeVirtualInventoryImpact', type: 'bool' },
    ],
    outputs: [{ name: 'marketTokensOut', type: UINT256 }],
  },
  {
    // One swap hop, priced exactly as SwapUtils executes it (fees and impact
    // included). Shape per the verified Reader source at syntheticsReader.
    name: 'getSwapAmountOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'dataStore', type: ADDRESS },
      READER_MARKET_INPUT,
      READER_PRICES_INPUT,
      { name: 'tokenIn', type: ADDRESS },
      { name: 'amountIn', type: UINT256 },
      { name: 'uiFeeReceiver', type: ADDRESS },
    ],
    outputs: [
      { name: 'amountOut', type: UINT256 },
      { name: 'impactAmount', type: 'int256' },
      {
        name: 'fees',
        type: 'tuple',
        components: [
          { name: 'feeReceiverAmount', type: UINT256 },
          { name: 'feeAmountForPool', type: UINT256 },
          { name: 'amountAfterFees', type: UINT256 },
          { name: 'uiFeeReceiver', type: ADDRESS },
          { name: 'uiFeeReceiverFactor', type: UINT256 },
          { name: 'uiFeeAmount', type: UINT256 },
        ],
      },
    ],
  },
] as const;

export const GMX_V2_EXCHANGE_ROUTER_ABI = [
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'data',
        type: 'bytes[]',
      },
    ],
    outputs: [
      {
        name: 'results',
        type: 'bytes[]',
      },
    ],
  },
  payableFunctionAbi('sendWnt', [
    { name: 'receiver', type: ADDRESS },
    { name: 'amount', type: UINT256 },
  ]),
  payableFunctionAbi('sendTokens', [
    { name: 'token', type: ADDRESS },
    { name: 'receiver', type: ADDRESS },
    { name: 'amount', type: UINT256 },
  ]),
  {
    name: 'createDeposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'addresses',
            type: 'tuple',
            components: [
              { name: 'receiver', type: ADDRESS },
              { name: 'callbackContract', type: ADDRESS },
              { name: 'uiFeeReceiver', type: ADDRESS },
              { name: 'market', type: ADDRESS },
              { name: 'initialLongToken', type: ADDRESS },
              { name: 'initialShortToken', type: ADDRESS },
              { name: 'longTokenSwapPath', type: 'address[]' },
              { name: 'shortTokenSwapPath', type: 'address[]' },
            ],
          },
          { name: 'minMarketTokens', type: UINT256 },
          { name: 'shouldUnwrapNativeToken', type: 'bool' },
          { name: 'executionFee', type: UINT256 },
          { name: 'callbackGasLimit', type: UINT256 },
          { name: 'dataList', type: `${BYTES32}[]` },
        ],
      },
    ],
    outputs: [{ name: 'key', type: BYTES32 }],
  },
  {
    // GMX v2 IWithdrawalUtils.CreateWithdrawalParams. Like createDeposit, the
    // params nest a `addresses` tuple — but the withdrawal addresses tuple has
    // no initialLong/ShortToken (you burn GM, you don't supply collateral) and
    // the numeric fields are minLong/minShortTokenAmount instead of
    // minMarketTokens. Shape verified against the on-chain verified ABI of the
    // ExchangeRouter (Arbitrum 0x1C3f…6A41).
    name: 'createWithdrawal',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'addresses',
            type: 'tuple',
            components: [
              { name: 'receiver', type: ADDRESS },
              { name: 'callbackContract', type: ADDRESS },
              { name: 'uiFeeReceiver', type: ADDRESS },
              { name: 'market', type: ADDRESS },
              { name: 'longTokenSwapPath', type: 'address[]' },
              { name: 'shortTokenSwapPath', type: 'address[]' },
            ],
          },
          { name: 'minLongTokenAmount', type: UINT256 },
          { name: 'minShortTokenAmount', type: UINT256 },
          { name: 'shouldUnwrapNativeToken', type: 'bool' },
          { name: 'executionFee', type: UINT256 },
          { name: 'callbackGasLimit', type: UINT256 },
          { name: 'dataList', type: `${BYTES32}[]` },
        ],
      },
    ],
    outputs: [{ name: 'key', type: BYTES32 }],
  },
] as const;
