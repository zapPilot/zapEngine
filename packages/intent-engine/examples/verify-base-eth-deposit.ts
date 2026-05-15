/**
 * Live no-broadcast verification for Base native ETH -> Morpho deposit.
 *
 * This exercises the production composeDeposit path:
 * composeDeposit -> buildSupplyTx -> LiFiAdapter.getQuote(toToken=vault).
 */

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';

import {
  composeDeposit,
  DEPOSIT_NATIVE_TOKEN,
  getVaultForBucket,
  LIFI_DIAMOND_ADDRESS,
  LiFiAdapter,
  SUPPORTED_CHAINS,
} from '../src/index.js';

const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_FROM_AMOUNT = '10000000000000000'; // 0.01 ETH
const DEFAULT_USER_ADDRESS =
  '0x1111111111111111111111111111111111111111' as Address;

interface RouteToken {
  address?: string;
  symbol?: string;
  decimals?: number;
}

interface RouteAction {
  fromChainId?: number;
  toChainId?: number;
  fromToken?: RouteToken;
  toToken?: RouteToken;
  fromAmount?: string;
}

interface RouteEstimate {
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
}

interface IncludedStep {
  type?: string;
  tool?: string;
  action?: RouteAction;
  estimate?: RouteEstimate;
}

interface RouteLike {
  tool?: string;
  action?: RouteAction;
  estimate?: RouteEstimate;
  includedSteps?: IncludedStep[];
}

function env(name: string): string | undefined {
  return process.env[name];
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAddress(value: string, label: string): Address {
  assert(/^0x[a-fA-F0-9]{40}$/.test(value), `${label} must be an EVM address`);
  return value as Address;
}

function assertConfiguredAddress(
  value: Address | undefined,
  label: string,
): Address {
  assert(value !== undefined, `${label} is not configured`);
  return value;
}

function assertPositiveBaseUnitString(value: string, label: string): string {
  assert(/^\d+$/.test(value), `${label} must be a base-unit integer string`);
  assert(BigInt(value) > 0n, `${label} must be greater than zero`);
  return value;
}

function sameAddress(left: string | undefined, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

function routeFromUnknown(route: unknown): RouteLike {
  return (route ?? {}) as RouteLike;
}

function formatToken(token: RouteToken | undefined): string {
  if (!token) {
    return 'unknown';
  }

  return `${token.symbol ?? 'token'}:${token.address ?? 'unknown'}`;
}

function summarizeStep(step: IncludedStep, index: number) {
  return {
    index,
    type: step.type ?? 'unknown',
    tool: step.tool ?? 'unknown',
    fromChainId: step.action?.fromChainId,
    toChainId: step.action?.toChainId,
    fromToken: formatToken(step.action?.fromToken),
    toToken: formatToken(step.action?.toToken),
    fromAmount: step.action?.fromAmount ?? step.estimate?.fromAmount,
    toAmount: step.estimate?.toAmount,
    toAmountMin: step.estimate?.toAmountMin,
  };
}

function summarizeRoute(route: RouteLike) {
  return {
    tool: route.tool ?? 'unknown',
    fromChainId: route.action?.fromChainId,
    toChainId: route.action?.toChainId,
    fromToken: formatToken(route.action?.fromToken),
    toToken: formatToken(route.action?.toToken),
    fromAmount: route.action?.fromAmount ?? route.estimate?.fromAmount,
    toAmount: route.estimate?.toAmount,
    toAmountMin: route.estimate?.toAmountMin,
    includedSteps: (route.includedSteps ?? []).map(summarizeStep),
  };
}

async function main() {
  const chainId = SUPPORTED_CHAINS.BASE;
  const fromToken = assertConfiguredAddress(
    DEPOSIT_NATIVE_TOKEN[chainId],
    `Native token for chain ${chainId}`,
  );
  const fromAmount = assertPositiveBaseUnitString(
    env('DEPOSIT_TEST_AMOUNT') ?? DEFAULT_FROM_AMOUNT,
    'DEPOSIT_TEST_AMOUNT',
  );
  const userAddress = assertAddress(
    env('DEPOSIT_TEST_ADDRESS') ?? DEFAULT_USER_ADDRESS,
    'DEPOSIT_TEST_ADDRESS',
  );
  const baseRpcUrl = env('BASE_RPC_URL') ?? DEFAULT_BASE_RPC_URL;
  const stableVault = getVaultForBucket(chainId, 'stable');

  assert(
    stableVault !== null,
    `No stable vault configured for chain ${chainId}`,
  );

  const adapter = new LiFiAdapter({
    integrator: 'zapengine-verify',
    ...(env('LIFI_API_KEY') ? { apiKey: env('LIFI_API_KEY') } : {}),
  });
  const basePublicClient = createPublicClient({
    chain: base,
    transport: http(baseRpcUrl),
  }) as PublicClient;

  console.log('Verifying Base native ETH -> Morpho deposit via LI.FI');
  console.log(
    JSON.stringify(
      {
        chainId,
        baseRpcUrl,
        fromToken,
        fromAmount,
        userAddress,
        vault: stableVault.vault,
        vaultAsset: stableVault.asset,
      },
      null,
      2,
    ),
  );

  const plan = await composeDeposit(
    {
      fromToken,
      fromAmount,
      sourceChainId: chainId,
      userAddress,
    },
    {
      adapter,
      publicClients: { [chainId]: basePublicClient },
    },
  );

  const directQuote = await adapter.getQuote({
    fromChain: chainId,
    toChain: chainId,
    fromToken,
    toToken: stableVault.vault,
    fromAmount,
    fromAddress: userAddress,
    slippageBps: 50,
    intentType: 'SUPPLY',
  });
  const directRoute = routeFromUnknown(directQuote.route);
  const includedSteps = directRoute.includedSteps ?? [];
  const supplyLeg = plan.legs[0];
  const firstCall = plan.calls[0];

  assert(
    plan.legs.length === 1 && supplyLeg?.kind === 'supply',
    'Expected exactly one supply leg',
  );
  assert(firstCall !== undefined, 'Expected one executable call');
  assert(
    sameAddress(firstCall.to, LIFI_DIAMOND_ADDRESS),
    `Expected call target ${LIFI_DIAMOND_ADDRESS}, got ${firstCall.to}`,
  );
  assert(plan.approvals.length === 0, 'Expected no approvals for native ETH');
  assert(
    BigInt(supplyLeg.toAmountMin) > 0n,
    `Expected positive toAmountMin, got ${supplyLeg.toAmountMin}`,
  );
  assert(
    includedSteps.some(
      (step) =>
        step.tool?.toLowerCase() === 'composer' &&
        sameAddress(step.action?.toToken?.address, stableVault.vault),
    ),
    'Expected an included composer step ending at the Morpho vault',
  );
  assert(
    includedSteps.some(
      (step) =>
        sameAddress(step.action?.toToken?.address, stableVault.asset) &&
        (step.type?.toLowerCase() === 'swap' ||
          step.tool?.toLowerCase() !== 'composer'),
    ),
    'Expected an included swap step ending at the vault asset',
  );

  console.log('\nDepositPlan');
  console.log(JSON.stringify(plan, null, 2));

  console.log('\nDirect LI.FI SUPPLY quote route');
  console.log(JSON.stringify(summarizeRoute(directRoute), null, 2));

  console.log('\nVerification passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
