/**
 * Hyperliquid HLP route verification harness.
 *
 * Pre-flight gate for funding HyperCore (1337) from any supported wallet
 * chain: hits the LIVE LI.FI, Hyperliquid, and Arbitrum RPC endpoints and
 * asserts that
 *   1. LI.FI still lists perps USDC on chain 1337 at HYPERCORE_PERPS_USDC
 *      (the spot-USDC token has a different address and 8 decimals),
 *   2. the HLP vault addresses still resolve via vaultDetails on both networks,
 *   3. real Base USDC / Ethereum USDC / Arbitrum ETH -> HyperCore quotes return
 *      a transactionRequest at the probe amounts, reporting fees/duration,
 *   4. the Bridge2 escrow — the fee-free Arbitrum USDC ingress we prefer over
 *      LI.FI — still holds code, still names Arbitrum USDC as its token, and
 *      still custodies a live balance.
 *
 * Run:
 *   pnpm --filter @zapengine/intent-engine exec tsx examples/hyperliquid-hlp-verify.ts
 *
 * Optional env:
 *   LIFI_API_KEY    - elevated LI.FI rate limits
 *   VERIFY_EOA      - quote fromAddress (default 0x1111...1111)
 *   VERIFY_AMOUNTS  - comma-separated USDC base units (default 50000000,10000000)
 *   ARBITRUM_RPC_URL - RPC for the Bridge2 escrow reads (default: viem's public)
 */

import { equalsAddress } from '@zapengine/types/shared';
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { arbitrum } from 'viem/chains';

import {
  encodeBridge2Deposit,
  HLP_VAULTS,
  HYPERCORE_CHAIN_ID,
  HYPERCORE_PERPS_USDC,
  HYPERCORE_USDC_DECIMALS,
  HYPERLIQUID_BRIDGE2_ADDRESS,
  HYPERLIQUID_EXCHANGE_API,
  type HyperliquidNetwork,
} from '../src/protocols/hyperliquid/index.js';
import {
  NATIVE_TOKEN,
  SUPPORTED_CHAINS,
  USDC_ADDRESS,
} from '../src/registry/chains.js';

const EOA =
  process.env.VERIFY_EOA ?? '0x1111111111111111111111111111111111111111';
const AMOUNTS = (process.env.VERIFY_AMOUNTS ?? '50000000,10000000').split(',');
const BASE_USDC = USDC_ADDRESS[SUPPORTED_CHAINS.BASE]!;
const ETHEREUM_USDC = USDC_ADDRESS[SUPPORTED_CHAINS.ETHEREUM]!;
const ARBITRUM_USDC = USDC_ADDRESS[SUPPORTED_CHAINS.ARBITRUM]!;
const ARBITRUM_ETH = NATIVE_TOKEN[SUPPORTED_CHAINS.ARBITRUM]!;

/** Bridge2 exposes the single ERC-20 it escrows. */
const BRIDGE2_ABI = parseAbi(['function usdcToken() view returns (address)']);

/**
 * Identity floor for the escrow, in USDC base units (100M USDC). The real
 * Bridge2 custodies hundreds of millions; anything near zero means we are
 * pointed at the wrong address.
 */
const BRIDGE2_MIN_ESCROW_BALANCE = 100_000_000_000_000n;

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? '✅' : '❌'} ${label}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
}

async function verifyPerpsUsdcToken(): Promise<void> {
  const response = await fetch(
    `https://li.quest/v1/tokens?chains=${HYPERCORE_CHAIN_ID}`,
  );
  const body = (await response.json()) as {
    tokens?: Record<
      string,
      Array<{ address: string; name: string; decimals: number }>
    >;
  };
  const token = body.tokens?.[String(HYPERCORE_CHAIN_ID)]?.find((entry) =>
    equalsAddress(entry.address, HYPERCORE_PERPS_USDC),
  );
  check(
    'LI.FI perps USDC on 1337',
    token !== undefined &&
      token.decimals === HYPERCORE_USDC_DECIMALS &&
      /perp/i.test(token.name),
    token ? `${token.name} (${token.decimals} decimals)` : 'token not listed',
  );
}

async function verifyHlpVault(network: HyperliquidNetwork): Promise<void> {
  const response = await fetch(`${HYPERLIQUID_EXCHANGE_API[network]}/info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'vaultDetails',
      vaultAddress: HLP_VAULTS[network],
    }),
  });
  const body = (await response.json()) as { name?: string } | null;
  check(
    `HLP vault (${network})`,
    /hyperliquidity provider/i.test(body?.name ?? ''),
    body?.name ?? 'no vault at address',
  );
}

async function verifyQuote(route: {
  label: string;
  fromChain: number;
  fromToken: string;
  fromAmount: string;
}): Promise<void> {
  const params = new URLSearchParams({
    fromChain: String(route.fromChain),
    toChain: String(HYPERCORE_CHAIN_ID),
    fromToken: route.fromToken,
    toToken: HYPERCORE_PERPS_USDC,
    fromAmount: route.fromAmount,
    fromAddress: EOA,
    integrator: 'zap-pilot',
  });
  const response = await fetch(`https://li.quest/v1/quote?${params}`, {
    headers: process.env.LIFI_API_KEY
      ? { 'x-lifi-api-key': process.env.LIFI_API_KEY }
      : {},
  });
  const body = (await response.json()) as {
    tool?: string;
    message?: string;
    transactionRequest?: { to?: string };
    estimate?: {
      toAmount?: string;
      toAmountMin?: string;
      executionDuration?: number;
    };
  };

  const ok = Boolean(body.transactionRequest?.to);
  check(
    `Quote ${route.label}->1337 for ${route.fromAmount}`,
    ok,
    ok
      ? `tool=${body.tool} toAmountMin=${body.estimate?.toAmountMin} duration=${body.estimate?.executionDuration}s`
      : (body.message ?? 'no transactionRequest'),
  );
}

/**
 * The Bridge2 path never touches LI.FI, so its only pre-flight evidence is the
 * escrow itself: deployed code, the token it accepts, and a live balance.
 */
async function verifyBridge2(): Promise<void> {
  const client = createPublicClient({
    chain: arbitrum,
    transport: http(process.env.ARBITRUM_RPC_URL),
  });

  const [code, token, balance] = await Promise.all([
    client.getCode({ address: HYPERLIQUID_BRIDGE2_ADDRESS }),
    client.readContract({
      address: HYPERLIQUID_BRIDGE2_ADDRESS,
      abi: BRIDGE2_ABI,
      functionName: 'usdcToken',
    }),
    client.readContract({
      address: ARBITRUM_USDC as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [HYPERLIQUID_BRIDGE2_ADDRESS],
    }),
  ]);

  check(
    'Bridge2 escrow is deployed',
    Boolean(code && code !== '0x'),
    code ? `${(code.length - 2) / 2} bytes of code` : 'no code at address',
  );
  check(
    'Bridge2 escrows native Arbitrum USDC',
    equalsAddress(token, ARBITRUM_USDC),
    `usdcToken() = ${token}`,
  );
  check(
    'Bridge2 still custodies USDC',
    balance >= BRIDGE2_MIN_ESCROW_BALANCE,
    `${balance / 1_000_000n} USDC`,
  );

  const decoded = decodeFunctionData({
    abi: erc20Abi,
    data: encodeBridge2Deposit(10_000_000n),
  });
  check(
    'encodeBridge2Deposit targets the escrow',
    decoded.functionName === 'transfer' &&
      equalsAddress(String(decoded.args[0]), HYPERLIQUID_BRIDGE2_ADDRESS),
    `transfer(${decoded.args[0]}, ${decoded.args[1]})`,
  );
}

async function main(): Promise<void> {
  await verifyPerpsUsdcToken();
  await verifyHlpVault('mainnet');
  await verifyHlpVault('testnet');
  for (const amount of AMOUNTS) {
    const fromAmount = amount.trim();
    await verifyQuote({
      label: 'Base USDC',
      fromChain: SUPPORTED_CHAINS.BASE,
      fromToken: BASE_USDC,
      fromAmount,
    });
    await verifyQuote({
      label: 'Ethereum USDC',
      fromChain: SUPPORTED_CHAINS.ETHEREUM,
      fromToken: ETHEREUM_USDC,
      fromAmount,
    });
  }
  // Native ETH is denominated in wei, so it gets its own probe amount.
  await verifyQuote({
    label: 'Arbitrum ETH',
    fromChain: SUPPORTED_CHAINS.ARBITRUM,
    fromToken: ARBITRUM_ETH,
    fromAmount: '20000000000000000',
  });
  await verifyBridge2();

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed — do NOT open the split.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed — safe to open DEPOSIT_DEFAULT_SPLIT.');
  }
}

void main();
