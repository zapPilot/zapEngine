import {
  createIntentEngine,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
  type GmxV2SupplyPlan,
} from '@zapengine/intent-engine';
import {
  type Address,
  createPublicClient,
  type Hash,
  http,
  type PublicClient,
} from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';

export const intentEngine = createIntentEngine({
  lifi: { integrator: 'zap-pilot-frontend' },
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

export interface BridgeStatus {
  status: string;
  substatus?: string;
  receiving?: {
    txHash?: Hash;
    chainId?: number;
  };
}

export async function getBridgeStatus({
  txHash,
  fromChain,
  toChain,
}: {
  txHash: Hash;
  fromChain: number;
  toChain: number;
}): Promise<BridgeStatus> {
  const params = new URLSearchParams({
    txHash,
    fromChain: fromChain.toString(),
    toChain: toChain.toString(),
  });
  const response = await fetch(`https://li.quest/v1/status?${params}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch LI.FI bridge status: ${response.status}`);
  }

  return (await response.json()) as BridgeStatus;
}

export async function buildGmxV2Deposit({
  marketKey,
  amount,
  userAddress,
}: {
  marketKey: GmxV2MarketKey;
  amount: string;
  userAddress: Address;
}): Promise<GmxV2SupplyPlan> {
  return intentEngine.buildGmxV2Supply({
    marketKey,
    fromToken: GMX_V2_TOKENS.USDC.address,
    fromAmount: amount,
    userAddress,
  });
}
