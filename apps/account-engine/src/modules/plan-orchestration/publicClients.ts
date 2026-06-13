import type { composeDeposit } from '@zapengine/intent-engine';
import { createPublicClient, http } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import type { ConfigService } from '../../config/config.service';

type ComposeDepositDeps = Parameters<typeof composeDeposit>[1];
export type DepositPublicClients = ComposeDepositDeps['publicClients'];

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
    }),
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
    }),
  };

  return () => publicClients;
}
