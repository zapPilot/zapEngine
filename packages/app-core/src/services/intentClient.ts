import { getRuntimeEnv } from '@core/lib/env/runtimeEnv';
import {
  createIntentEngine,
  type BridgeProviderId,
  type BridgeQuote,
  type BridgeSettlement,
} from '@zapengine/intent-engine';
import { createPublicClient, type Hash, http, type PublicClient } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

export const intentEngine = createIntentEngine({
  lifi: { integrator: 'zap-pilot-frontend' },
  bridges: {
    eco: { dAppId: 'zap-pilot-frontend' },
    across: {
      get apiKey() {
        return getRuntimeEnv('VITE_ACROSS_API_KEY');
      },
      get integratorId() {
        return (
          getRuntimeEnv('VITE_ACROSS_INTEGRATOR_ID') ?? 'zap-pilot-frontend'
        );
      },
    },
  },
});

const publicClients: Record<number, unknown> = {
  [mainnet.id]: createPublicClient({
    chain: mainnet,
    transport: http('https://ethereum-rpc.publicnode.com'),
  }),
  [arbitrum.id]: createPublicClient({
    chain: arbitrum,
    transport: http('https://arb1.arbitrum.io/rpc'),
  }),
  [base.id]: createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  }),
};

export function getPublicClient(chainId: number): PublicClient {
  const client = publicClients[chainId];
  if (!client) {
    throw new Error(`No public client configured for chain ${chainId}`);
  }
  return client as PublicClient;
}

export class BridgeFailedError extends Error {
  constructor(readonly settlement: BridgeSettlement) {
    super(`Bridge transfer failed on ${settlement.sourceTxHash}`);
    this.name = 'BridgeFailedError';
  }
}

export async function waitForBridgeCompletion({
  provider,
  txHash,
  fromChain,
  toChain,
  quote,
  signal,
}: {
  provider: BridgeProviderId;
  txHash: Hash;
  fromChain: number;
  toChain: number;
  quote?: BridgeQuote;
  signal?: AbortSignal;
}): Promise<BridgeSettlement> {
  const settlement = await intentEngine.waitForBridgeCompletion({
    provider,
    sourceTxHash: txHash,
    fromChainId: fromChain,
    toChainId: toChain,
    ...(quote ? { quote } : {}),
    ...(signal ? { signal } : {}),
  });
  if (settlement.status === 'failed') {
    throw new BridgeFailedError(settlement);
  }
  return settlement;
}
