/**
 * Hyperliquid HLP route verification harness.
 *
 * Pre-flight gate for opening DEPOSIT_DEFAULT_SPLIT toward HyperCore (1337):
 * hits the LIVE LI.FI and Hyperliquid APIs and asserts that
 *   1. LI.FI still lists perps USDC on chain 1337 at HYPERCORE_PERPS_USDC
 *      (the spot-USDC token has a different address and 8 decimals),
 *   2. the HLP vault addresses still resolve via vaultDetails on both networks,
 *   3. a real Base USDC -> HyperCore quote returns a transactionRequest at the
 *      probe amounts, reporting fees/duration and any filtered-out routes.
 *
 * Run:
 *   pnpm --filter @zapengine/intent-engine exec tsx examples/hyperliquid-hlp-verify.ts
 *
 * Optional env:
 *   LIFI_API_KEY    - elevated LI.FI rate limits
 *   VERIFY_EOA      - quote fromAddress (default 0x1111...1111)
 *   VERIFY_AMOUNTS  - comma-separated USDC base units (default 50000000,5000000)
 */

import {
  HLP_VAULTS,
  HYPERCORE_CHAIN_ID,
  HYPERCORE_PERPS_USDC,
  HYPERCORE_USDC_DECIMALS,
  HYPERLIQUID_EXCHANGE_API,
  type HyperliquidNetwork,
} from '../src/protocols/hyperliquid/index.js';
import { SUPPORTED_CHAINS, USDC_ADDRESS } from '../src/registry/chains.js';

const EOA =
  process.env.VERIFY_EOA ?? '0x1111111111111111111111111111111111111111';
const AMOUNTS = (process.env.VERIFY_AMOUNTS ?? '50000000,5000000').split(',');
const BASE_USDC = USDC_ADDRESS[SUPPORTED_CHAINS.BASE]!;

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? '✅' : '❌'} ${label}: ${detail}`);
  if (!ok) failures += 1;
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
  const token = body.tokens?.[String(HYPERCORE_CHAIN_ID)]?.find(
    (entry) =>
      entry.address.toLowerCase() === HYPERCORE_PERPS_USDC.toLowerCase(),
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

async function verifyQuote(fromAmount: string): Promise<void> {
  const params = new URLSearchParams({
    fromChain: String(SUPPORTED_CHAINS.BASE),
    toChain: String(HYPERCORE_CHAIN_ID),
    fromToken: BASE_USDC,
    toToken: HYPERCORE_PERPS_USDC,
    fromAmount,
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
    `Quote Base->1337 for ${fromAmount}`,
    ok,
    ok
      ? `tool=${body.tool} toAmountMin=${body.estimate?.toAmountMin} duration=${body.estimate?.executionDuration}s`
      : (body.message ?? 'no transactionRequest'),
  );
}

async function main(): Promise<void> {
  await verifyPerpsUsdcToken();
  await verifyHlpVault('mainnet');
  await verifyHlpVault('testnet');
  for (const amount of AMOUNTS) {
    await verifyQuote(amount.trim());
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed — do NOT open the split.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed — safe to open DEPOSIT_DEFAULT_SPLIT.');
  }
}

void main();
