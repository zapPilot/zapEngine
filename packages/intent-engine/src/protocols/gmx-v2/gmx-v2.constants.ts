import type { Address } from 'viem';

export const GMX_V2_ARBITRUM_CHAIN_ID = 42161;

export const GMX_V2_ADDRESSES = {
  exchangeRouter: '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41',
  depositVault: '0xF89e77e8Dc11691C9e8757e84aaFbCD8A67d7A55',
  dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
  syntheticsReader: '0x470fbC46bcC0f16532691Df360A07d8Bf5ee0789',
  router: '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6',
} as const satisfies Record<string, Address>;

export const GMX_V2_TOKENS = {
  USDC: {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    decimals: 6,
  },
  WETH: {
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    symbol: 'WETH',
    decimals: 18,
  },
  WBTC_B: {
    address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    symbol: 'WBTC.b',
    decimals: 8,
  },
} as const satisfies Record<
  string,
  {
    readonly address: Address;
    readonly symbol: string;
    readonly decimals: number;
  }
>;

export type GmxV2FundedSide = 'long' | 'short';

export interface GmxV2Market {
  readonly key: GmxV2MarketKey;
  readonly name: string;
  readonly marketToken: Address;
  readonly indexToken: Address;
  readonly longToken: Address;
  readonly shortToken: Address;
  readonly fundedSide: GmxV2FundedSide;
  readonly collateralToken: Address;
}

export type GmxV2MarketKey = 'btc-btc' | 'eth-eth' | 'btc-usdc' | 'eth-usdc';

export const GMX_V2_MARKETS = {
  'btc-usdc': {
    key: 'btc-usdc',
    name: 'GM BTC/USD [WBTC.b-USDC]',
    marketToken: '0x47c031236e19d024b42f8AE6780E44A573170703',
    indexToken: '0x47904963fc8b2340414262125aF798B9655E58Cd',
    longToken: GMX_V2_TOKENS.WBTC_B.address,
    shortToken: GMX_V2_TOKENS.USDC.address,
    fundedSide: 'short',
    collateralToken: GMX_V2_TOKENS.USDC.address,
  },
  'eth-usdc': {
    key: 'eth-usdc',
    name: 'GM ETH/USD [WETH-USDC]',
    marketToken: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
    indexToken: GMX_V2_TOKENS.WETH.address,
    longToken: GMX_V2_TOKENS.WETH.address,
    shortToken: GMX_V2_TOKENS.USDC.address,
    fundedSide: 'short',
    collateralToken: GMX_V2_TOKENS.USDC.address,
  },
  'btc-btc': {
    key: 'btc-btc',
    name: 'GM BTC/USD [WBTC.b-WBTC.b]',
    marketToken: '0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77',
    indexToken: '0x47904963fc8b2340414262125aF798B9655E58Cd',
    longToken: GMX_V2_TOKENS.WBTC_B.address,
    shortToken: GMX_V2_TOKENS.WBTC_B.address,
    fundedSide: 'long',
    collateralToken: GMX_V2_TOKENS.WBTC_B.address,
  },
  'eth-eth': {
    key: 'eth-eth',
    name: 'GM ETH/USD [WETH-WETH]',
    marketToken: '0x450bb6774Dd8a756274E0ab4107953259d2ac541',
    indexToken: GMX_V2_TOKENS.WETH.address,
    longToken: GMX_V2_TOKENS.WETH.address,
    shortToken: GMX_V2_TOKENS.WETH.address,
    fundedSide: 'long',
    collateralToken: GMX_V2_TOKENS.WETH.address,
  },
} as const satisfies Record<GmxV2MarketKey, GmxV2Market>;

export const GMX_V2_EXECUTION_FEE_WEI = '1000000000000000';

export const GMX_V2_GAS_ESTIMATES = {
  approve: '60000',
  multicall: '1200000',
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
] as const;
