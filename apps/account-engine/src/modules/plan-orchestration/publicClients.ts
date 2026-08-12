import type { composeDeposit } from '@zapengine/intent-engine';
import { createPublicClient, http } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

import type { ConfigService } from '../../config/config.service';

type ComposeDepositDeps = Parameters<typeof composeDeposit>[1];
export type DepositPublicClients = ComposeDepositDeps['publicClients'];

function getRpcUrl(
  configService: Pick<ConfigService, 'get'>,
  key: string,
  defaultUrl: string,
): string {
  return configService.get<string>(key) ?? defaultUrl;
}

export function createDepositPublicClients(
  configService: Pick<ConfigService, 'get'>,
): DepositPublicClients {
  return {
    [mainnet.id]: createPublicClient({
      chain: mainnet,
      transport: http(
        getRpcUrl(
          configService,
          'RPC_URL_ETHEREUM',
          'https://ethereum-rpc.publicnode.com',
        ),
      ),
    }),
    [base.id]: createPublicClient({
      chain: base,
      transport: http(
        getRpcUrl(configService, 'RPC_URL_BASE', 'https://mainnet.base.org'),
      ),
    }) as DepositPublicClients[number],
    [arbitrum.id]: createPublicClient({
      chain: arbitrum,
      transport: http(
        getRpcUrl(
          configService,
          'RPC_URL_ARBITRUM',
          'https://arb1.arbitrum.io/rpc',
        ),
      ),
    }),
  };
}
