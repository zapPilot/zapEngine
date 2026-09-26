import type { PlanOrchestrationDepositReviewRequest } from '@zapengine/types/api';

import type { LayaVerdict } from '../lib/laya.js';

export const RULE_ID = 'bitget-eth-pressure-v1';
export const RULE_EXPIRES_AT = Date.parse('2026-10-04T00:00:00Z');
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
export const AMOUNT = 1_000_000n;
export const HACK_THRESHOLD = 0.8;
export const DASHBOARD_URL = 'https://v2.zap-pilot.org/ai-wallet';

// Dry-run only: the CLI refuses --execute/--replay without a real episode.
export const FIXTURE = {
  title:
    'Bitget hacked: attacker swaps 19.67M USDT0 into 7,111 ETH in six minutes',
  script:
    "Bitget was hacked on September 24. The attacker's fresh wallet, starting with 0xe410, used 19.67 million USDT0 to buy 7,111 ETH within six minutes, a sudden wave of on-chain buying pressure on ETH.",
};

export function ruleFires(verdict: LayaVerdict): boolean {
  return (
    verdict.exchangeHack >= HACK_THRESHOLD && verdict.pressure === 'upward'
  );
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
