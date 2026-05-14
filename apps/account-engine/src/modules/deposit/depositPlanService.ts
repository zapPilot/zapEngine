import { composeDeposit, type LiFiAdapter } from '@zapengine/intent-engine';
import {
  type DepositPlan,
  DepositPlanSchema,
  type DepositRequest,
} from '@zapengine/types/api';
import { createPublicClient, http } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import type { ConfigService } from '../../config/config.service';

type ComposeDepositDeps = Parameters<typeof composeDeposit>[1];
type DepositPublicClients = ComposeDepositDeps['publicClients'];

export interface DepositPlanService {
  build(userId: string, request: DepositRequest): Promise<DepositPlan>;
}

export interface DepositPlanServiceDeps {
  analyticsClientService: {
    getDailySuggestion(userId: string): Promise<unknown>;
  };
  adapter: LiFiAdapter;
  publicClientsForDeposit: () => DepositPublicClients;
  composeDeposit?: typeof composeDeposit;
}

function getRpcUrl(
  configService: Pick<ConfigService, 'get'>,
  primaryKey: string,
  fallbackKey: string,
  fallbackUrl: string,
): string {
  return (
    configService.get<string>(primaryKey) ??
    configService.get<string>(fallbackKey) ??
    fallbackUrl
  );
}

export function createDepositPublicClients(
  configService: Pick<ConfigService, 'get'>,
): () => DepositPublicClients {
  const publicClients: DepositPublicClients = {
    [mainnet.id]: createPublicClient({
      chain: mainnet,
      transport: http(
        getRpcUrl(
          configService,
          'RPC_URL_ETHEREUM',
          'ETHEREUM_RPC_URL',
          'https://ethereum-rpc.publicnode.com',
        ),
      ),
    }) as DepositPublicClients[number],
    [base.id]: createPublicClient({
      chain: base,
      transport: http(
        getRpcUrl(
          configService,
          'RPC_URL_BASE',
          'BASE_RPC_URL',
          'https://mainnet.base.org',
        ),
      ),
    }) as DepositPublicClients[number],
    [arbitrum.id]: createPublicClient({
      chain: arbitrum,
      transport: http(
        getRpcUrl(
          configService,
          'RPC_URL_ARBITRUM',
          'ARBITRUM_RPC_URL',
          'https://arb1.arbitrum.io/rpc',
        ),
      ),
    }) as DepositPublicClients[number],
  };

  return () => publicClients;
}

export const createDepositPublicClientForChain = createDepositPublicClients;

export function createDepositPlanService({
  adapter,
  publicClientsForDeposit,
  composeDeposit: compose = composeDeposit,
}: DepositPlanServiceDeps): DepositPlanService {
  return {
    async build(
      _userId: string,
      request: DepositRequest,
    ): Promise<DepositPlan> {
      const plan = await compose(
        {
          userAddress: request.userAddress as `0x${string}`,
          fromToken: request.fromToken as `0x${string}`,
          fromAmount: request.fromAmount,
          sourceChainId: request.sourceChainId,
        },
        { adapter, publicClients: publicClientsForDeposit() },
      );

      return DepositPlanSchema.parse(plan);
    },
  };
}
