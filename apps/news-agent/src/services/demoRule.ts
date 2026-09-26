import type { PlanOrchestrationDepositReviewRequest } from '@zapengine/types/api';

export const RULE_ID = 'fixed-0.1-usdc-spark-vault-v1';
export const RULE_EXPIRES_AT = Date.parse('2026-10-04T00:00:00Z');
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
export const AMOUNT = 100_000n;
/** The story `serve` runs on every trigger; swap it to demo another one. */
export const TRIGGER_EPISODE = '0f85db1e-ae06-45ea-89a7-360ec63ff072';
export const DASHBOARD_URL = 'https://v2.zap-pilot.org/ai-wallet';

// The dashboard has no backend of its own: the run's episode travels in the
// link, while every transaction fact is read from chain.
export function dashboardUrl(episode: string): string {
  return `${DASHBOARD_URL}?${new URLSearchParams({ episode }).toString()}`;
}

export function planRequest(
  wallet: `0x${string}`,
): PlanOrchestrationDepositReviewRequest {
  return {
    kind: 'invest',
    userAddress: wallet,
    fromToken: USDC,
    fromAmount: AMOUNT.toString(),
    sourceChainId: 8453,
    split: { '8453': 1 },
  };
}
