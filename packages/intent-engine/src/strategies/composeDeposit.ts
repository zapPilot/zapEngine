import {
  DepositPlanSchema,
  type DepositFollowUp,
  type DepositLeg,
  type DepositPlan,
  type PreparedTransaction,
} from '@zapengine/types/api';
import { type Address, type PublicClient } from 'viem';

import type { LiFiAdapter } from '../adapters/lifi.adapter.js';
import {
  buildApproveTx,
  needsApproval,
  type ApprovalRequirement,
} from '../approvals/erc20Approval.js';
import { buildBridgeTx } from '../builders/bridge.builder.js';
import { buildSupplyTx } from '../builders/supply.builder.js';
import {
  buildHlpDepositFollowUp,
  HLP_MIN_DEPOSIT_USD,
  HYPERCORE_CHAIN_ID,
  HYPERCORE_PERPS_USDC,
  type HyperliquidNetwork,
} from '../protocols/hyperliquid/index.js';
import {
  NATIVE_TOKEN,
  SUPPORTED_CHAINS,
  USDC_ADDRESS,
} from '../registry/chains.js';
import { getVaultForBucket } from '../registry/vaults.js';
import type { TransactionQuote } from '../types/transaction.types.js';

// Built-in fallback only — the production split is injected by
// plan-orchestration (DEPOSIT_DEFAULT_SPLIT env), which is the no-deploy
// rollback lever while cross-chain routes are being proven out.
const DEFAULT_SPLIT: ChainSplit = {
  [SUPPORTED_CHAINS.BASE]: 1.0,
};
const DEFAULT_CHAIN_ORDER = [
  SUPPORTED_CHAINS.BASE,
  SUPPORTED_CHAINS.ETHEREUM,
  SUPPORTED_CHAINS.ARBITRUM,
  HYPERCORE_CHAIN_ID,
] as const;
const SPLIT_SCALE = 1_000_000;

export type ChainSplit = Partial<Record<number, number>>;

export interface ComposeDepositInput {
  fromToken: Address;
  fromAmount: string;
  sourceChainId: number;
  userAddress: Address;
  split?: ChainSplit;
}

export interface ComposeDepositDeps {
  adapter: LiFiAdapter;
  publicClients: Record<number, PublicClient>;
  hyperliquidNetwork?: HyperliquidNetwork;
}

function isNativeToken(chainId: number, token: Address): boolean {
  return token.toLowerCase() === NATIVE_TOKEN[chainId]?.toLowerCase();
}

function approvalRequirementKey(params: {
  tokenAddress: Address;
  spenderAddress: Address;
}): string {
  return `${params.tokenAddress.toLowerCase()}:${params.spenderAddress.toLowerCase()}`;
}

function addApprovalRequirement(
  requirements: Map<string, ApprovalRequirement>,
  approval:
    | {
        tokenAddress: Address;
        spenderAddress: Address;
        amount: string;
      }
    | undefined,
): void {
  if (!approval) {
    return;
  }

  const amount = BigInt(approval.amount);
  if (amount <= 0n) {
    return;
  }

  const key = approvalRequirementKey(approval);
  const existing = requirements.get(key);

  if (existing) {
    existing.amount += amount;
    return;
  }

  requirements.set(key, {
    tokenAddress: approval.tokenAddress,
    spenderAddress: approval.spenderAddress,
    amount,
  });
}

function splitAmounts(
  totalAmount: string,
  split: ChainSplit,
): Array<{
  chainId: number;
  amount: string;
}> {
  const total = BigInt(totalAmount);
  const knownChainIds = new Set<number>(DEFAULT_CHAIN_ORDER);
  for (const key of Object.keys(split)) {
    if (!knownChainIds.has(Number(key))) {
      throw new Error(`Unsupported deposit split chain ${key}`);
    }
  }
  const entries = DEFAULT_CHAIN_ORDER.map((chainId) => ({
    chainId,
    weight: split[chainId] ?? 0,
  })).filter((entry) => entry.weight > 0);

  if (entries.length === 0) {
    throw new Error('Deposit split must include at least one positive leg');
  }

  const scaledWeights = entries.map((entry) => ({
    chainId: entry.chainId,
    weight: BigInt(Math.round(entry.weight * SPLIT_SCALE)),
  }));
  const totalWeight = scaledWeights.reduce(
    (sum, entry) => sum + entry.weight,
    0n,
  );

  if (totalWeight <= 0n) {
    throw new Error('Deposit split must include at least one positive leg');
  }

  let allocated = 0n;
  return scaledWeights.map((entry, index) => {
    const amount =
      index === scaledWeights.length - 1
        ? total - allocated
        : (total * entry.weight) / totalWeight;
    allocated += amount;
    return { chainId: entry.chainId, amount: amount.toString() };
  });
}

function bridgeName(route: unknown): string | undefined {
  if (
    typeof route === 'object' &&
    route !== null &&
    'tool' in route &&
    typeof route.tool === 'string'
  ) {
    return route.tool;
  }

  return undefined;
}

function bridgeLegFromQuote(params: {
  chainId: number;
  toToken: Address;
  fromAmount: string;
  quote: TransactionQuote;
  protocol?: string;
}): DepositLeg {
  const bridge = bridgeName(params.quote.route);
  return {
    chainId: params.chainId,
    kind: 'bridge',
    ...(params.protocol ? { protocol: params.protocol } : {}),
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    toAmountMin: params.quote.estimate.toAmountMin,
    ...(bridge ? { bridge } : {}),
    gasUsd: params.quote.estimate.gasCostUsd,
    durationSec: params.quote.estimate.executionDuration,
  };
}

function totalGasUsd(quotes: TransactionQuote[]): string {
  return quotes
    .reduce(
      (sum, quote) => sum + Number.parseFloat(quote.estimate.gasCostUsd),
      0,
    )
    .toString();
}

function sourcePublicClient(
  publicClients: Record<number, PublicClient>,
  sourceChainId: number,
): PublicClient {
  const publicClient = publicClients[sourceChainId];
  if (!publicClient) {
    throw new Error(`No public client configured for chain ${sourceChainId}`);
  }
  return publicClient;
}

function resolveSplit(input: ComposeDepositInput): ChainSplit {
  const isBaseSource = input.sourceChainId === SUPPORTED_CHAINS.BASE;
  const split =
    input.split ??
    (isBaseSource ? DEFAULT_SPLIT : { [input.sourceChainId]: 1 });

  if (!isBaseSource) {
    // Non-Base sources exist only for destination re-quotes (bridge landed →
    // re-plan with the received amount); re-bridging from them is not allowed.
    const foreignLeg = Object.entries(split).find(
      ([chainId, weight]) =>
        (weight ?? 0) > 0 && Number(chainId) !== input.sourceChainId,
    );
    if (foreignLeg) {
      throw new Error(
        'Non-Base source chains support a single-chain split only',
      );
    }
  }

  return split;
}

export async function composeDeposit(
  input: ComposeDepositInput,
  deps: ComposeDepositDeps,
): Promise<DepositPlan> {
  const supportedSources: readonly number[] = Object.values(SUPPORTED_CHAINS);
  if (!supportedSources.includes(input.sourceChainId)) {
    throw new Error(
      `Unsupported source chain ${input.sourceChainId} — expected one of ${supportedSources.join(', ')}`,
    );
  }

  const sourceClient = sourcePublicClient(
    deps.publicClients,
    input.sourceChainId,
  );
  const allocations = splitAmounts(input.fromAmount, resolveSplit(input));
  const legs: DepositLeg[] = [];
  const calls: PreparedTransaction[] = [];
  const followUps: DepositFollowUp[] = [];
  const quotes: TransactionQuote[] = [];
  const approvalRequirements = new Map<string, ApprovalRequirement>();

  for (const allocation of allocations) {
    if (allocation.chainId === input.sourceChainId) {
      const stableVault = getVaultForBucket(allocation.chainId, 'stable');
      if (!stableVault) {
        throw new Error(
          `No stable deposit vault configured for chain ${allocation.chainId}`,
        );
      }
      if (stableVault.protocol !== 'morpho') {
        throw new Error(
          `Unsupported stable deposit protocol ${stableVault.protocol}`,
        );
      }

      const quote = await buildSupplyTx(
        {
          type: 'SUPPLY',
          chainId: input.sourceChainId,
          fromAddress: input.userAddress,
          fromToken: input.fromToken,
          fromAmount: allocation.amount,
          vaultAddress: stableVault.vault,
          protocol: stableVault.protocol,
        },
        deps.adapter,
        sourceClient,
      );

      quotes.push(quote);
      calls.push(quote.transaction);
      if (
        !isNativeToken(input.sourceChainId, input.fromToken) &&
        input.fromToken.toLowerCase() === stableVault.asset.toLowerCase()
      ) {
        addApprovalRequirement(approvalRequirements, {
          tokenAddress: input.fromToken,
          spenderAddress: stableVault.vault,
          amount: allocation.amount,
        });
      } else {
        addApprovalRequirement(approvalRequirements, quote.approval);
      }
      legs.push({
        chainId: allocation.chainId,
        kind: 'supply',
        protocol: stableVault.protocol,
        toToken: stableVault.asset,
        fromAmount: allocation.amount,
        toAmountMin: quote.estimate.toAmountMin,
        gasUsd: quote.estimate.gasCostUsd,
        durationSec: quote.estimate.executionDuration,
      });
      continue;
    }

    if (allocation.chainId === HYPERCORE_CHAIN_ID) {
      const quote = await buildBridgeTx(
        {
          fromChainId: input.sourceChainId,
          toChainId: HYPERCORE_CHAIN_ID,
          fromToken: input.fromToken,
          toToken: HYPERCORE_PERPS_USDC,
          fromAmount: allocation.amount,
          userAddress: input.userAddress,
        },
        deps.adapter,
      );

      // Checked against the quoted output (6-decimal perp USDC) rather than
      // the allocation, which may be denominated in a different source token.
      if (BigInt(quote.estimate.toAmountMin) < BigInt(HLP_MIN_DEPOSIT_USD)) {
        throw new Error(
          `HLP allocation is below the vault minimum of ${HLP_MIN_DEPOSIT_USD} perp USDC base units (quoted ${quote.estimate.toAmountMin})`,
        );
      }

      quotes.push(quote);
      calls.push(quote.transaction);
      addApprovalRequirement(approvalRequirements, quote.approval);
      legs.push(
        bridgeLegFromQuote({
          chainId: HYPERCORE_CHAIN_ID,
          toToken: HYPERCORE_PERPS_USDC,
          fromAmount: allocation.amount,
          quote,
          protocol: 'hyperliquid',
        }),
      );
      followUps.push(
        buildHlpDepositFollowUp({
          afterLegIndex: legs.length - 1,
          expectedUsd: quote.estimate.toAmountMin,
          ...(deps.hyperliquidNetwork
            ? { network: deps.hyperliquidNetwork }
            : {}),
        }),
      );
      continue;
    }

    const toToken = USDC_ADDRESS[allocation.chainId];
    if (!toToken) {
      throw new Error(
        `No USDC address configured for chain ${allocation.chainId}`,
      );
    }

    const quote = await buildBridgeTx(
      {
        fromChainId: input.sourceChainId,
        toChainId: allocation.chainId,
        fromToken: input.fromToken,
        toToken,
        fromAmount: allocation.amount,
        userAddress: input.userAddress,
      },
      deps.adapter,
    );

    quotes.push(quote);
    calls.push(quote.transaction);
    addApprovalRequirement(approvalRequirements, quote.approval);
    legs.push(
      bridgeLegFromQuote({
        chainId: allocation.chainId,
        toToken,
        fromAmount: allocation.amount,
        quote,
      }),
    );
  }

  const approvals: PreparedTransaction[] = [];
  for (const requirement of approvalRequirements.values()) {
    if (
      await needsApproval({
        publicClient: sourceClient,
        owner: input.userAddress,
        requirement,
      })
    ) {
      approvals.push(
        buildApproveTx({
          token: requirement.tokenAddress,
          spender: requirement.spenderAddress,
          amount: requirement.amount.toString(),
          chainId: input.sourceChainId,
        }),
      );
    }
  }

  return DepositPlanSchema.parse({
    legs,
    approvals,
    calls,
    ...(followUps.length > 0 ? { followUps } : {}),
    totalGasUsd: totalGasUsd(quotes),
    sourceChainId: input.sourceChainId,
  });
}
