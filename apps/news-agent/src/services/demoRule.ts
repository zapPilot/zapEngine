import type { PlanOrchestrationDepositReviewRequest } from '@zapengine/types/api';

import { type LayaVerdict, PRESSURES } from '../lib/laya.js';

export const RULE_ID = 'fixed-1-usdc-spark-vault-v1';
export const RULE_EXPIRES_AT = Date.parse('2026-10-04T00:00:00Z');
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
export const AMOUNT = 1_000_000n;
export const DASHBOARD_URL = 'https://v2.zap-pilot.org/ai-wallet';

// The dashboard has no backend of its own: the run's episode and Laya analysis
// travel in the link, while every transaction fact is read from chain.
export function dashboardUrl(
  episode: string,
  analysis: LayaVerdict | null,
): string {
  const params = new URLSearchParams({ episode });
  if (analysis) {
    params.set('hack', analysis.exchangeHack.toFixed(4));
    params.set('eth', analysis.pressure);
    for (const key of PRESSURES) {
      const probability = analysis.pressureProbabilities[key];
      if (probability !== undefined) params.set(key, probability.toFixed(4));
    }
  }
  return `${DASHBOARD_URL}?${params.toString()}`;
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
