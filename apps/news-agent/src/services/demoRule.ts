import type { PlanOrchestrationRotateReviewRequest } from '@zapengine/types/api';

export const RULE_ID = 'fixed-clearstar-eth-to-spark-usdc-v1';
export const RULE_EXPIRES_AT = Date.parse('2026-10-04T00:00:00Z');
export const WETH = '0x4200000000000000000000000000000000000006';
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Clearstar Core ETH (CSCOREETH), a Morpho Vault V2 holding WETH. */
export const ETH_VAULT = '0xBCA4E2E24A7cFa776E4282CC8Eb06f04738b71da';
/** Spark USDC Vault (sparkUSDC), a MetaMorpho vault holding USDC. */
export const USDC_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
/** Target of every LI.FI swap; its calldata comes from the LI.FI quote. */
export const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
/** Clearstar shares rotated per run (18 decimals, ~0.0001 WETH). */
export const SHARES = 100_000_000_000_000n;
/** The story `serve` runs on every trigger; swap it to demo another one. */
export const TRIGGER_EPISODE = '0f85db1e-ae06-45ea-89a7-360ec63ff072';
export const DASHBOARD_URL = 'https://v2.zap-pilot.org/ai-wallet';

// The dashboard has no backend of its own: the run's episode travels in the
// link, while every transaction fact is read from chain.
export function dashboardUrl(episode: string): string {
  return `${DASHBOARD_URL}?${new URLSearchParams({ episode }).toString()}`;
}

export function rotateRequest(
  wallet: `0x${string}`,
): PlanOrchestrationRotateReviewRequest {
  return {
    userAddress: wallet,
    chainId: 8453,
    fromVault: ETH_VAULT,
    toVault: USDC_VAULT,
    shareAmount: SHARES.toString(),
  };
}
