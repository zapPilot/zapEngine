import { useHyperliquidAgentSession } from '@zapengine/app-core/hooks/useHyperliquidAgentSession';
import type { HyperliquidSigning } from '@zapengine/types/api';

import hyperliquidAgentKeyStorage from '@/storage/hyperliquidAgentKeyStorage';

export function useHyperliquidAgent(signing: HyperliquidSigning | null) {
  return useHyperliquidAgentSession({
    keyStore: hyperliquidAgentKeyStorage,
    signing,
  });
}
