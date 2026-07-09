import {
  type ApprovalRequirement,
  assertApprovalCaps,
  assertMinReceived,
  buildApproveTx,
  type BundleSimulationAdapter,
  composeDeposit,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_TOKENS,
  type IntentEngine,
  type LiFiAdapter,
  needsApproval,
} from '@zapengine/intent-engine';
import {
  BASE_CHAIN_ID,
  type ChainSplit,
  type DepositPlan,
  DepositPlanSchema,
  type PlanOrchestrationDepositRequest,
  type PlanOrchestrationWithdrawRequest,
  type PreparedTransaction,
  type WithdrawPlan,
  WithdrawPlanSchema,
} from '@zapengine/types/api';
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type PublicClient,
} from 'viem';

import {
  PlanSimulationFailedError,
  PlanSimulationUnavailableError,
} from './errors';
import type { DepositPublicClients } from './publicClients';

export interface PlanOrchestrationService {
  buildDeposit(request: PlanOrchestrationDepositRequest): Promise<DepositPlan>;
  buildWithdraw(
    request: PlanOrchestrationWithdrawRequest,
  ): Promise<WithdrawPlan>;
}

/** Chain-id-keyed allocation weights, as consumed by composeDeposit. */
export type DepositChainSplit = Partial<Record<number, number>>;

/** Bundle-simulation dependency for the fail-closed plan gate. */
export interface PlanSimulationDeps {
  adapter: BundleSimulationAdapter;
  mode: 'enforce' | 'off';
}

export interface PlanOrchestrationServiceDeps {
  intentEngine: Pick<
    IntentEngine,
    'buildGmxV2Supply' | 'buildGmxV2Withdraw' | 'buildWithdrawSwap'
  >;
  adapter: LiFiAdapter;
  publicClients: DepositPublicClients;
  composeDeposit?: typeof composeDeposit;
  /** Default allocation for Base-source invest plans; requests may override. */
  defaultSplit?: DepositChainSplit;
  /** Hyperliquid network for HLP follow-up descriptors (default mainnet). */
  hyperliquidNetwork?: 'mainnet' | 'testnet';
  /** Fail-closed bundle simulation gate; omitted = off. */
  simulation?: PlanSimulationDeps;
}

function chainSplitFromRequest(
  split: ChainSplit | undefined,
): DepositChainSplit | undefined {
  if (!split) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(split).map(([chainId, weight]) => [Number(chainId), weight]),
  );
}

function publicClientFor(
  publicClients: DepositPublicClients,
  chainId: number,
): PublicClient {
  const publicClient = publicClients[chainId];
  if (!publicClient) {
    throw new Error(`No public client configured for chain ${chainId}`);
  }
  return publicClient;
}

function approvalRequirementFromTx(
  tx: PreparedTransaction,
): ApprovalRequirement {
  const decoded = decodeFunctionData({
    abi: erc20Abi,
    data: tx.data as `0x${string}`,
  });

  if (decoded.functionName !== 'approve') {
    throw new Error('Expected ERC20 approve transaction');
  }

  const [spenderAddress, amount] = decoded.args;
  return {
    tokenAddress: tx.to as Address,
    spenderAddress,
    amount,
  };
}

async function filterNeededApprovals(params: {
  approvals: PreparedTransaction[];
  owner: Address;
  publicClient: PublicClient;
}): Promise<PreparedTransaction[]> {
  const neededApprovals: PreparedTransaction[] = [];

  for (const approval of params.approvals) {
    const requirement = approvalRequirementFromTx(approval);
    if (
      await needsApproval({
        publicClient: params.publicClient,
        owner: params.owner,
        requirement,
      })
    ) {
      neededApprovals.push(
        buildApproveTx({
          token: requirement.tokenAddress,
          spender: requirement.spenderAddress,
          amount: requirement.amount.toString(),
          chainId: approval.chainId,
          gasLimit: approval.gasLimit ?? GMX_V2_GAS_ESTIMATES.approve,
        }),
      );
    }
  }

  return neededApprovals;
}

// The Morpho withdraw-swap plan surfaces a single LiFi approval as a
// requirement (token/spender/amount), not a prepared tx. Convert it into an
// approve tx only when the on-chain allowance is insufficient.
async function neededApprovalFromRequirement(params: {
  approval:
    | { tokenAddress: Address; spenderAddress: Address; amount: string }
    | undefined;
  owner: Address;
  publicClient: PublicClient;
  chainId: number;
}): Promise<PreparedTransaction[]> {
  if (!params.approval) {
    return [];
  }

  const requirement: ApprovalRequirement = {
    tokenAddress: params.approval.tokenAddress,
    spenderAddress: params.approval.spenderAddress,
    amount: BigInt(params.approval.amount),
  };

  if (
    !(await needsApproval({
      publicClient: params.publicClient,
      owner: params.owner,
      requirement,
    }))
  ) {
    return [];
  }

  return [
    buildApproveTx({
      token: requirement.tokenAddress,
      spender: requirement.spenderAddress,
      amount: requirement.amount.toString(),
      chainId: params.chainId,
    }),
  ];
}

/** Server-side slippage ceiling for routed calls (bps). */
const MAX_PLAN_SLIPPAGE_BPS = 100;

/**
 * Fail-closed gate, run on every plan before it is returned:
 * the pure safety validators always, then the bundle simulation when
 * enforced. `followUps` (HyperCore actions) are not EVM transactions and are
 * never simulated — only the source-chain approvals+calls batch is.
 */
async function assertPlanSafety(params: {
  plan: {
    approvals: PreparedTransaction[];
    calls: PreparedTransaction[];
    sourceChainId: number;
  };
  userAddress: string;
  intent: { fromToken?: string; fromAmount?: string };
  simulation: PlanSimulationDeps | undefined;
}): Promise<void> {
  assertApprovalCaps(params.plan, params.intent);
  assertMinReceived(params.plan, { maxSlippageBps: MAX_PLAN_SLIPPAGE_BPS });

  if (params.simulation?.mode !== 'enforce') {
    return;
  }

  const result = await params.simulation.adapter.simulateBundle({
    chainId: params.plan.sourceChainId,
    from: params.userAddress,
    calls: [...params.plan.approvals, ...params.plan.calls],
  });

  if (result.status === 'failed') {
    throw new PlanSimulationFailedError(result.reason);
  }
  if (result.status === 'unavailable') {
    throw new PlanSimulationUnavailableError(result.reason);
  }
}

async function finalizePlan<
  T extends {
    approvals: PreparedTransaction[];
    calls: PreparedTransaction[];
    sourceChainId: number;
  },
>(
  plan: T,
  params: {
    userAddress: string;
    simulation: PlanSimulationDeps | undefined;
  },
): Promise<T> {
  await assertPlanSafety({
    plan,
    userAddress: params.userAddress,
    intent: {},
    simulation: params.simulation,
  });
  return plan;
}

function gmxCollateralAmount(approvals: PreparedTransaction[]): string {
  const routerAddress = GMX_V2_ADDRESSES.router.toLowerCase();
  const approval = approvals.find((tx) => {
    const requirement = approvalRequirementFromTx(tx);
    return requirement.spenderAddress.toLowerCase() === routerAddress;
  });

  return approval ? approvalRequirementFromTx(approval).amount.toString() : '0';
}

export function createPlanOrchestrationService({
  adapter,
  composeDeposit: compose = composeDeposit,
  defaultSplit,
  hyperliquidNetwork,
  intentEngine,
  publicClients,
  simulation,
}: PlanOrchestrationServiceDeps): PlanOrchestrationService {
  return {
    async buildDeposit(request): Promise<DepositPlan> {
      if (request.kind === 'invest') {
        // The env-configured default only applies to Base-source plans;
        // non-Base sources are destination re-quotes and default to
        // single-chain inside composeDeposit.
        const split =
          chainSplitFromRequest(request.split) ??
          (request.sourceChainId === BASE_CHAIN_ID ? defaultSplit : undefined);
        const plan = await compose(
          {
            userAddress: request.userAddress as Address,
            fromToken: request.fromToken as Address,
            fromAmount: request.fromAmount,
            sourceChainId: request.sourceChainId,
            ...(split ? { split } : {}),
          },
          {
            adapter,
            publicClients,
            ...(hyperliquidNetwork ? { hyperliquidNetwork } : {}),
          },
        );

        const parsed = DepositPlanSchema.parse(plan);
        await assertPlanSafety({
          plan: parsed,
          userAddress: request.userAddress,
          intent: {
            fromToken: request.fromToken,
            fromAmount: request.fromAmount,
          },
          simulation,
        });
        return parsed;
      }

      const publicClient = publicClientFor(
        publicClients,
        GMX_V2_ARBITRUM_CHAIN_ID,
      );
      const userAddress = request.userAddress as Address;
      const gmxPlan = await intentEngine.buildGmxV2Supply({
        marketKey: request.marketKey,
        fromToken: GMX_V2_TOKENS.USDC.address,
        fromAmount: request.amount,
        userAddress,
      });
      const approvals = await filterNeededApprovals({
        approvals: gmxPlan.approvals,
        owner: userAddress,
        publicClient,
      });
      const collateralAmount =
        gmxCollateralAmount(gmxPlan.approvals) || request.amount;

      return finalizePlan(
        DepositPlanSchema.parse({
          legs: [
            {
              chainId: GMX_V2_ARBITRUM_CHAIN_ID,
              kind: 'supply',
              protocol: 'gmx-v2',
              toToken: gmxPlan.market.collateralToken,
              fromAmount: request.amount,
              toAmountMin: collateralAmount,
              gasUsd: '0',
              durationSec: 60,
            },
          ],
          approvals,
          calls: gmxPlan.steps,
          totalGasUsd: '0',
          sourceChainId: GMX_V2_ARBITRUM_CHAIN_ID,
        }),
        { userAddress: request.userAddress, simulation },
      );
    },

    async buildWithdraw(request): Promise<WithdrawPlan> {
      if (request.kind === 'gmx-v2') {
        const publicClient = publicClientFor(
          publicClients,
          GMX_V2_ARBITRUM_CHAIN_ID,
        );
        const userAddress = request.userAddress as Address;
        const gmxPlan = await intentEngine.buildGmxV2Withdraw({
          marketKey: request.marketKey,
          gmAmount: request.gmAmount,
          userAddress,
        });
        const approvals = await filterNeededApprovals({
          approvals: gmxPlan.approvals,
          owner: userAddress,
          publicClient,
        });

        // GMX settles long+short asynchronously via the keeper; the leg's
        // toToken is the market's representative collateral token. No swap.
        return finalizePlan(
          WithdrawPlanSchema.parse({
            legs: [
              {
                chainId: GMX_V2_ARBITRUM_CHAIN_ID,
                kind: 'withdraw',
                protocol: 'gmx-v2',
                toToken: gmxPlan.market.collateralToken,
                fromAmount: request.gmAmount,
                toAmountMin: '0',
                gasUsd: '0',
                durationSec: 60,
              },
            ],
            approvals,
            calls: gmxPlan.steps,
            totalGasUsd: '0',
            sourceChainId: GMX_V2_ARBITRUM_CHAIN_ID,
          }),
          { userAddress: request.userAddress, simulation },
        );
      }

      const { chainId } = request;
      const publicClient = publicClientFor(publicClients, chainId);
      const userAddress = request.userAddress as Address;
      const plan = await intentEngine.buildWithdrawSwap(
        {
          vaultAddress: request.vaultAddress as Address,
          shareAmount: request.shareAmount,
          ...(request.toToken ? { toToken: request.toToken as Address } : {}),
          fromAddress: userAddress,
          chainId,
        },
        publicClient,
      );
      const approvals = await neededApprovalFromRequirement({
        approval: plan.approval,
        owner: userAddress,
        publicClient,
        chainId,
      });

      const legs: WithdrawPlan['legs'] = [
        {
          chainId,
          kind: 'withdraw',
          protocol: 'morpho',
          toToken: plan.assetToken,
          fromAmount: request.shareAmount,
          toAmountMin: plan.redeemAmount,
          gasUsd: '0',
          durationSec: 0,
        },
      ];
      // A second step means the redeemed asset is swapped into the chosen token.
      if (plan.steps.length > 1 && request.toToken) {
        legs.push({
          chainId,
          kind: 'swap',
          protocol: 'lifi',
          toToken: request.toToken,
          fromAmount: plan.redeemAmount,
          toAmountMin: plan.estimates.expectedOutput,
          gasUsd: plan.estimates.totalGasUsd,
          durationSec: plan.estimates.totalDuration,
        });
      }

      return finalizePlan(
        WithdrawPlanSchema.parse({
          legs,
          approvals,
          calls: plan.steps,
          totalGasUsd: plan.estimates.totalGasUsd,
          sourceChainId: chainId,
        }),
        { userAddress: request.userAddress, simulation },
      );
    },
  };
}
