import type { HyperliquidAgentSessionStatus } from '@zapengine/app-core/hooks/useHyperliquidAgentSession';

export function hlpSpotSignatureLabel(
  agentStatus: HyperliquidAgentSessionStatus,
): string {
  return agentStatus === 'ready'
    ? 'None — signing enabled'
    : '1 — enable Hyperliquid signing';
}
