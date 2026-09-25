/**
 * GMX v2 deposit fork replay.
 *
 * Builds the REAL deposit plan for each GMX market (live GMX Reader and oracle
 * prices; live LI.FI only for USDT), then replays it on current Arbitrum state
 * with `eth_simulateV1`: the wallet's merged approvals and calls run as one
 * simulated block, and the script plays GMX's keeper for every deposit the
 * batch created:
 *   1. DepositHandler.simulateExecuteDeposit — GMX's own dry run, which only
 *      reverts with EndOfOracleSimulation after a complete execution;
 *   2. DepositHandler.executeDeposit from a real ORDER_KEEPER, with the oracle
 *      provider's code swapped for one that returns the GMX ticker prices
 *      unsigned, so the swap path runs and the GM tokens actually mint.
 * Only the price signatures are mocked; pools, fees, impact, and the deposit
 * shape run against live state. No Tenderly quota is used.
 *
 * Run:
 *   pnpm --filter @zapengine/intent-engine exec tsx examples/gmx-v2-deposit-fork-replay.ts
 *
 * Optional env:
 *   REPLAY_TOKEN    - USDC | USDT | ETH | WETH (default USDC)
 *   REPLAY_AMOUNT   - funding per market in base units (default: 53200 for
 *                     stablecoins — one pool of Stable 99% / Crypto 1% at the
 *                     $10.64 minimum — or 20000000000000 wei for ETH/WETH)
 *   REPLAY_MARKETS  - comma-separated market keys (default: the basket)
 *   REPLAY_RPC_URL  - Arbitrum RPC serving eth_simulateV1
 *                     (default https://arbitrum-one-rpc.publicnode.com)
 *   LIFI_API_KEY    - elevated LI.FI rate limits (USDT only)
 */

import {
  createPublicClient,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  pad,
  parseAbi,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
  type Log,
} from 'viem';
import { arbitrum } from 'viem/chains';

import {
  createIntentEngine,
  type GmxV2SupplyPlan,
  type PreparedTransaction,
} from '../src/index.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_BASKET_MARKET_KEYS,
  GMX_V2_MARKETS,
  GMX_V2_ORACLE_URLS,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
} from '../src/protocols/gmx-v2/index.js';

const RPC_URL =
  process.env.REPLAY_RPC_URL ?? 'https://arbitrum-one-rpc.publicnode.com';
const EOA = '0x5a11ce0000000000000000000000000000000a11' as Address;
const TOKEN_KEY = (process.env.REPLAY_TOKEN ?? 'USDC') as
  | 'USDC'
  | 'USDT'
  | 'ETH'
  | 'WETH';
const FUNDING_TOKEN = GMX_V2_TOKENS[TOKEN_KEY].address;
const AMOUNT =
  process.env.REPLAY_AMOUNT ??
  (TOKEN_KEY === 'USDC' || TOKEN_KEY === 'USDT' ? '53200' : '20000000000000');
const MARKETS = (process.env.REPLAY_MARKETS?.split(',') ?? [
  ...GMX_V2_BASKET_MARKET_KEYS,
]) as GmxV2MarketKey[];

// ERC-20 balance mapping slots, found by probing balanceOf under eth_call
// state overrides (FiatToken USDC: 9; OpenZeppelin-upgradeable USDT0/WETH: 51).
const BALANCE_SLOT: Partial<Record<string, bigint>> = {
  [GMX_V2_TOKENS.USDC.address.toLowerCase()]: 9n,
  [GMX_V2_TOKENS.USDT.address.toLowerCase()]: 51n,
  [GMX_V2_TOKENS.WETH.address.toLowerCase()]: 51n,
};

// getOraclePrice(token, data) returns `data` (an abi-encoded ValidatedPrice,
// 7 words) verbatim; shouldAdjustTimestamp(), isChainlinkOnChainProvider() and
// shouldCheckRefPrice() read zero-padded calldata and so return false.
const ECHO_ORACLE_PROVIDER_CODE: Hex = '0x60e0606460003760e06000f3';
const END_OF_ORACLE_SIMULATION = toFunctionSelector('EndOfOracleSimulation()');

const GMX_ABI = parseAbi([
  'function roleStore() view returns (address)',
  'function depositHandler() view returns (address)',
  'function eventEmitter() view returns (address)',
  'function oracle() view returns (address)',
  'function hasRole(address account, bytes32 roleKey) view returns (bool)',
  'function getRoleMembers(bytes32 roleKey, uint256 start, uint256 end) view returns (address[])',
  'function getUint(bytes32 key) view returns (uint256)',
  'function getAddress(bytes32 key) view returns (address)',
  'struct Price { uint256 min; uint256 max; }',
  'struct SimulatePricesParams { address[] primaryTokens; Price[] primaryPrices; uint256 minTimestamp; uint256 maxTimestamp; }',
  'struct SetPricesParams { address[] tokens; address[] providers; bytes[] data; }',
  'function simulateExecuteDeposit(bytes32 key, SimulatePricesParams params)',
  'function executeDeposit(bytes32 key, SetPricesParams oracleParams)',
]);

const hashString = (value: string) =>
  keccak256(encodeAbiParameters([{ type: 'string' }], [value]));

interface Ticker {
  tokenAddress: string;
  minPrice: string;
  maxPrice: string;
}

function tickerPrice(tickers: readonly Ticker[], token: Address) {
  const ticker = tickers.find(
    (candidate) => candidate.tokenAddress.toLowerCase() === token.toLowerCase(),
  );
  if (!ticker) {
    throw new Error(`GMX oracle has no ticker for ${token}`);
  }
  return { min: BigInt(ticker.minPrice), max: BigInt(ticker.maxPrice) };
}

/** Sum approvals per (token, spender), as plan-orchestration merges a batch. */
function mergeApprovals(
  approvals: readonly PreparedTransaction[],
): PreparedTransaction[] {
  const merged = new Map<string, PreparedTransaction & { total: bigint }>();
  for (const approval of approvals) {
    const { args } = decodeFunctionData({
      abi: erc20Abi,
      data: approval.data as Hex,
    });
    const [spender, amount] = args as readonly [Address, bigint];
    const key = `${approval.to.toLowerCase()}:${spender.toLowerCase()}`;
    const total = (merged.get(key)?.total ?? 0n) + amount;
    merged.set(key, {
      ...approval,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, total],
      }),
      total,
    });
  }
  return [...merged.values()];
}

/** GMX EventEmitter logs lead with (address msgSender, string eventName). */
function gmxEventNames(logs: readonly Log[] | undefined, emitter: Address) {
  return (logs ?? [])
    .filter((log) => log.address.toLowerCase() === emitter.toLowerCase())
    .map(
      (log) =>
        decodeAbiParameters(
          [{ type: 'address' }, { type: 'string' }],
          log.data,
        )[1],
    );
}

function planTokens(plan: GmxV2SupplyPlan): Address[] {
  const route = plan.steps.at(-1)!.meta.route as { swapPath: GmxV2MarketKey[] };
  const markets = [
    plan.market,
    ...route.swapPath.map((key) => GMX_V2_MARKETS[key]),
  ];
  const tokens = new Map<string, Address>();
  for (const market of markets) {
    for (const token of [
      market.indexToken,
      market.longToken,
      market.shortToken,
    ]) {
      tokens.set(token.toLowerCase(), token);
    }
  }
  return [...tokens.values()];
}

async function main() {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(RPC_URL),
  });
  const engine = createIntentEngine({
    lifi: {
      integrator: 'zap-pilot',
      ...(process.env.LIFI_API_KEY ? { apiKey: process.env.LIFI_API_KEY } : {}),
    },
  });

  const read = <T>(
    address: Address,
    functionName: string,
    args: unknown[] = [],
  ) =>
    client.readContract({
      address,
      abi: GMX_ABI,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;

  // A stale router has lost its roles and reverts every deposit.
  const roleStore = await read<Address>(
    GMX_V2_ADDRESSES.exchangeRouter,
    'roleStore',
  );
  if (
    !(await read<boolean>(roleStore, 'hasRole', [
      GMX_V2_ADDRESSES.exchangeRouter,
      hashString('CONTROLLER'),
    ]))
  ) {
    throw new Error(
      `GMX_V2_ADDRESSES.exchangeRouter ${GMX_V2_ADDRESSES.exchangeRouter} is no longer a GMX CONTROLLER — GMX upgraded; update the constants`,
    );
  }
  const depositHandler = await read<Address>(
    GMX_V2_ADDRESSES.exchangeRouter,
    'depositHandler',
  );
  const oracle = await read<Address>(depositHandler, 'oracle');
  const [keeper] = await read<Address[]>(roleStore, 'getRoleMembers', [
    hashString('ORDER_KEEPER'),
    0n,
    1n,
  ]);
  const eventEmitter = await read<Address>(
    GMX_V2_ADDRESSES.exchangeRouter,
    'eventEmitter',
  );

  console.error(
    `Building ${MARKETS.join(' + ')} from ${AMOUNT} ${TOKEN_KEY} each (live GMX Reader${TOKEN_KEY === 'USDT' ? ' and LI.FI' : ''})…`,
  );
  const plans = await Promise.all(
    MARKETS.map((marketKey) =>
      engine.buildGmxV2Supply(
        {
          marketKey,
          fromToken: FUNDING_TOKEN,
          fromAmount: AMOUNT,
          userAddress: EOA,
        },
        client,
      ),
    ),
  );

  const block = await client.getBlock({ blockTag: 'latest' });
  const time = block.timestamp + 1n;
  const nonce = await read<bigint>(GMX_V2_ADDRESSES.dataStore, 'getUint', [
    hashString('NONCE'),
  ]);
  const tickersResponse = await fetch(GMX_V2_ORACLE_URLS[0]);
  const tickers = (await tickersResponse.json()) as Ticker[];

  const batch = [
    ...mergeApprovals(plans.flatMap((plan) => plan.approvals)),
    ...plans.flatMap((plan) => plan.steps),
  ];
  const keeperCalls = await Promise.all(
    plans.map(async (plan, index) => {
      // Each createDeposit takes the next DataStore nonce as its key.
      const key = keccak256(
        encodeAbiParameters(
          [{ type: 'address' }, { type: 'uint256' }],
          [GMX_V2_ADDRESSES.dataStore, nonce + BigInt(index) + 1n],
        ),
      );
      const tokens = planTokens(plan);
      const providers = await Promise.all(
        tokens.map((token) =>
          read<Address>(GMX_V2_ADDRESSES.dataStore, 'getAddress', [
            keccak256(
              encodeAbiParameters(
                [{ type: 'bytes32' }, { type: 'address' }, { type: 'address' }],
                [hashString('ORACLE_PROVIDER_FOR_TOKEN'), oracle, token],
              ),
            ),
          ]),
        ),
      );
      const prices = tokens.map((token) => tickerPrice(tickers, token));
      return {
        plan,
        providers,
        simulate: encodeFunctionData({
          abi: GMX_ABI,
          functionName: 'simulateExecuteDeposit',
          args: [
            key,
            {
              primaryTokens: tokens,
              primaryPrices: prices,
              minTimestamp: time,
              maxTimestamp: time,
            },
          ],
        }),
        execute: encodeFunctionData({
          abi: GMX_ABI,
          functionName: 'executeDeposit',
          args: [
            key,
            {
              tokens,
              providers,
              data: tokens.map((token, i) =>
                encodeAbiParameters(
                  [
                    { type: 'address' },
                    { type: 'uint256' },
                    { type: 'uint256' },
                    { type: 'uint256' },
                    { type: 'uint256' },
                    { type: 'uint256' },
                    { type: 'address' },
                  ],
                  [
                    token,
                    prices[i]!.min,
                    prices[i]!.max,
                    prices[i]!.min,
                    prices[i]!.max,
                    time,
                    providers[i]!,
                  ],
                ),
              ),
            },
          ],
        }),
      };
    }),
  );

  const balanceOfEoa = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [EOA],
  });
  const fundingSlot = BALANCE_SLOT[FUNDING_TOKEN.toLowerCase()];
  const calls = [
    ...batch.map((tx) => ({
      account: EOA,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: BigInt(tx.value),
      gas: 5_000_000n,
    })),
    ...keeperCalls.flatMap(({ plan, simulate, execute }) => [
      { account: EOA, to: depositHandler, data: simulate, gas: 25_000_000n },
      { account: EOA, to: plan.market.marketToken, data: balanceOfEoa },
      { account: keeper!, to: depositHandler, data: execute, gas: 25_000_000n },
      { account: EOA, to: plan.market.marketToken, data: balanceOfEoa },
    ]),
  ];
  const [simulated] = await client.simulateBlocks({
    blockNumber: block.number,
    validation: false,
    blocks: [
      {
        blockOverrides: { number: block.number + 1n, time },
        stateOverrides: [
          {
            address: EOA,
            balance: 10n ** 18n + BigInt(AMOUNT) * BigInt(MARKETS.length),
          },
          ...(fundingSlot === undefined
            ? []
            : [
                {
                  address: FUNDING_TOKEN,
                  stateDiff: [
                    {
                      slot: keccak256(
                        encodeAbiParameters(
                          [{ type: 'address' }, { type: 'uint256' }],
                          [EOA, fundingSlot],
                        ),
                      ),
                      value: pad(
                        toHex(BigInt(AMOUNT) * BigInt(MARKETS.length)),
                      ),
                    },
                  ],
                },
              ]),
          ...[
            ...new Set(keeperCalls.flatMap(({ providers }) => providers)),
          ].map((address) => ({ address, code: ECHO_ORACLE_PROVIDER_CODE })),
        ],
        calls,
      },
    ],
  });
  const results = simulated!.calls;

  const batchResults = results.slice(0, batch.length).map((result, index) => ({
    to: batch[index]!.to,
    intentType: batch[index]!.meta.intentType,
    status: result.status,
    gasUsed: result.gasUsed.toString(),
    events: gmxEventNames(result.logs, eventEmitter).filter((name) =>
      name.startsWith('Deposit'),
    ),
  }));
  const deposits = keeperCalls.map(({ plan }, index) => {
    const [simulate, before, execute, after] = results.slice(
      batch.length + index * 4,
      batch.length + index * 4 + 4,
    );
    const minted = BigInt(after!.data) - BigInt(before!.data);
    return {
      market: plan.market.key,
      swapPath: (plan.steps.at(-1)!.meta.route as { swapPath: string[] })
        .swapPath,
      simulateExecuteDeposit:
        simulate!.status === 'failure' &&
        simulate!.data.startsWith(END_OF_ORACLE_SIMULATION)
          ? 'EndOfOracleSimulation (executed)'
          : `unexpected ${simulate!.status} ${simulate!.data.slice(0, 74)}`,
      keeperExecuteDeposit: {
        status: execute!.status,
        events: gmxEventNames(execute!.logs, eventEmitter).filter((name) =>
          name.startsWith('Deposit'),
        ),
      },
      estimatedMarketTokens: plan.estimatedMarketTokens,
      minMarketTokens: plan.minMarketTokens,
      gmMinted: minted.toString(),
      minted: minted >= BigInt(plan.minMarketTokens),
    };
  });

  console.log(
    JSON.stringify(
      {
        block: block.number.toString(),
        token: TOKEN_KEY,
        amount: AMOUNT,
        batch: batchResults,
        deposits,
      },
      null,
      2,
    ),
  );
  if (
    batchResults.some((result) => result.status !== 'success') ||
    !deposits.every((d) => d.minted)
  ) {
    throw new Error('GMX deposit fork replay failed — see the report above');
  }
}

main().catch((error: unknown) => {
  console.error('GMX deposit fork replay failed:', error);
  process.exitCode = 1;
});
