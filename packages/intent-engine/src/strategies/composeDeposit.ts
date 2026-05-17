import {
  DepositPlanSchema,
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
  NATIVE_TOKEN,
  SUPPORTED_CHAINS,
  USDC_ADDRESS,
} from '../registry/chains.js';
import { getVaultForBucket } from '../registry/vaults.js';
import type { TransactionQuote } from '../types/transaction.types.js';

// TODO(lifi): restore the 60/20/20 split once LI.FI bridge quotes are reliable.
// For now we deposit 100% on the source chain so the EIP-7702 and sequential
// paths can be tested against a known-working Morpho ERC4626 deposit.
const DEFAULT_SPLIT: ChainSplit = {
  [SUPPORTED_CHAINS.BASE]: 1.0,
};
const DEFAULT_CHAIN_ORDER = [
  SUPPORTED_CHAINS.BASE,
  SUPPORTED_CHAINS.ETHEREUM,
  SUPPORTED_CHAINS.ARBITRUM,
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

export async function composeDeposit(
  input: ComposeDepositInput,
  deps: ComposeDepositDeps,
): Promise<DepositPlan> {
  if (input.sourceChainId !== SUPPORTED_CHAINS.BASE) {
    throw new Error('Deposit v1 supports Base as the source chain');
  }

  const sourceClient = sourcePublicClient(
    deps.publicClients,
    input.sourceChainId,
  );
  const allocations = splitAmounts(
    input.fromAmount,
    input.split ?? DEFAULT_SPLIT,
  );
  const legs: DepositLeg[] = [];
  const calls: PreparedTransaction[] = [];
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
    legs.push({
      chainId: allocation.chainId,
      kind: 'bridge',
      toToken,
      fromAmount: allocation.amount,
      toAmountMin: quote.estimate.toAmountMin,
      ...(bridgeName(quote.route) ? { bridge: bridgeName(quote.route) } : {}),
      gasUsd: quote.estimate.gasCostUsd,
      durationSec: quote.estimate.executionDuration,
    });
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
    totalGasUsd: totalGasUsd(quotes),
    sourceChainId: input.sourceChainId,
  });
}
