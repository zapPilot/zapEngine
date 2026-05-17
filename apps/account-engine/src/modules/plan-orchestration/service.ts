import {
  type ApprovalRequirement,
  buildApproveTx,
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
  type DepositPlan,
  DepositPlanSchema,
  type PlanOrchestrationDepositRequest,
  type PreparedTransaction,
} from '@zapengine/types/api';
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  type PublicClient,
} from 'viem';

import type { DepositPublicClients } from './publicClients';

export interface PlanOrchestrationService {
  buildDeposit(request: PlanOrchestrationDepositRequest): Promise<DepositPlan>;
}

export interface PlanOrchestrationServiceDeps {
  intentEngine: Pick<IntentEngine, 'buildGmxV2Supply'>;
  adapter: LiFiAdapter;
  publicClients: DepositPublicClients;
  composeDeposit?: typeof composeDeposit;
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
  intentEngine,
  publicClients,
}: PlanOrchestrationServiceDeps): PlanOrchestrationService {
  return {
    async buildDeposit(request): Promise<DepositPlan> {
      if (request.kind === 'invest') {
        const plan = await compose(
          {
            userAddress: request.userAddress as Address,
            fromToken: request.fromToken as Address,
            fromAmount: request.fromAmount,
            sourceChainId: request.sourceChainId,
          },
          { adapter, publicClients },
        );

        return DepositPlanSchema.parse(plan);
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
        approvals: gmxPlan.approvals as PreparedTransaction[],
        owner: userAddress,
        publicClient,
      });
      const collateralAmount =
        gmxCollateralAmount(gmxPlan.approvals as PreparedTransaction[]) ||
        request.amount;

      return DepositPlanSchema.parse({
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
      });
    },
  };
}
