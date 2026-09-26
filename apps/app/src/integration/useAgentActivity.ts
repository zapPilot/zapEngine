import { createQueryConfig } from '@zapengine/app-core/hooks/queries/queryDefaults';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  ACTIVITY_POLL_INTERVAL_MS,
  AGENT_ADDRESS,
  BASE_RPC_URLS,
  BLOCKSCOUT_API_URL,
  ETH_VAULT_ADDRESS,
  POSITION_POLL_INTERVAL_MS,
  USDC_ADDRESS,
  VAULT_ADDRESS,
} from '@/config/aiWalletDemo';
import {
  createBasePublicClient,
  fetchAgentTransactions,
  isAgentConfigured,
  readAgentPosition,
  type AgentContracts,
} from '@/integration/agentActivity';

const AGENT_CONTRACTS: AgentContracts = {
  agentAddress: AGENT_ADDRESS,
  usdcAddress: USDC_ADDRESS,
  vaultAddress: VAULT_ADDRESS,
  ethVaultAddress: ETH_VAULT_ADDRESS,
};

export const AGENT_CONFIGURED = isAgentConfigured(AGENT_ADDRESS);

let baseClient: ReturnType<typeof createBasePublicClient> | null = null;

function getBaseClient() {
  baseClient ??= createBasePublicClient(BASE_RPC_URLS);
  return baseClient;
}

export function useAgentTransactions() {
  return useQuery({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: ['ai-wallet', 'transactions', AGENT_ADDRESS],
    queryFn: () => fetchAgentTransactions(AGENT_CONTRACTS, BLOCKSCOUT_API_URL),
    enabled: AGENT_CONFIGURED,
    refetchInterval: ACTIVITY_POLL_INTERVAL_MS,
  });
}

/**
 * Keyed by the latest deposit so a newly confirmed run re-reads the vault
 * right away instead of waiting out the poll interval.
 */
export function useAgentPosition(latestDepositHash: string | null) {
  return useQuery({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: ['ai-wallet', 'position', AGENT_ADDRESS, latestDepositHash],
    placeholderData: keepPreviousData,
    queryFn: () => readAgentPosition(getBaseClient(), AGENT_CONTRACTS),
    enabled: AGENT_CONFIGURED,
    refetchInterval: POSITION_POLL_INTERVAL_MS,
  });
}
