import { createIntentEngine, LiFiAdapter } from '@zapengine/intent-engine';
import {
  ChainSplitSchema,
  HYPERCORE_CHAIN_ID,
  SUPPORTED_DEPOSIT_CHAINS,
} from '@zapengine/types/api';

import type { DepositPublicClients } from './publicClients';
import {
  createPlanOrchestrationService,
  type DepositChainSplit,
  type PlanOrchestrationService,
} from './service';

export interface PlanOrchestrationModuleConfig {
  lifi: {
    integrator: string;
    apiKey?: string;
  };
  publicClients: DepositPublicClients;
  deposit?: {
    /** Default allocation for Base-source invest plans; requests may override. */
    defaultSplit?: DepositChainSplit;
  };
  hyperliquid?: {
    network: 'mainnet' | 'testnet';
  };
}

/**
 * Parse the DEPOSIT_DEFAULT_SPLIT env value (JSON like {"8453":0.7,"1337":0.3}).
 * This is the no-deploy rollout/rollback lever for cross-chain deposits —
 * malformed values must fail container startup, not surface per-request.
 */
export function parseDepositDefaultSplit(raw: string): DepositChainSplit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `DEPOSIT_DEFAULT_SPLIT is not valid JSON: ${(error as Error).message}`,
    );
  }

  const result = ChainSplitSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `DEPOSIT_DEFAULT_SPLIT is invalid: ${result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }

  const supportedSplitChains = new Set<number>([
    ...Object.values(SUPPORTED_DEPOSIT_CHAINS),
    HYPERCORE_CHAIN_ID,
  ]);
  const unsupportedChainIds = Object.keys(result.data)
    .map(Number)
    .filter((chainId) => !supportedSplitChains.has(chainId));
  if (unsupportedChainIds.length > 0) {
    throw new Error(
      `DEPOSIT_DEFAULT_SPLIT contains unsupported chain id(s): ${unsupportedChainIds.join(
        ', ',
      )}`,
    );
  }

  return Object.fromEntries(
    Object.entries(result.data).map(([chainId, weight]) => [
      Number(chainId),
      weight,
    ]),
  );
}

// The composition root for the plan-orchestration plane: it owns the only
// permitted instantiation of intent-engine inside account-engine. Container
// code must call this factory with primitives rather than reaching for
// `@zapengine/intent-engine` directly. See apps/account-engine/CLAUDE.md
// (Architecture boundary).
export function createPlanOrchestrationModule(
  config: PlanOrchestrationModuleConfig,
): PlanOrchestrationService {
  const adapter = new LiFiAdapter({
    integrator: config.lifi.integrator,
    ...(config.lifi.apiKey ? { apiKey: config.lifi.apiKey } : {}),
  });
  const intentEngine = createIntentEngine({
    lifi: {
      integrator: config.lifi.integrator,
      ...(config.lifi.apiKey ? { apiKey: config.lifi.apiKey } : {}),
    },
  });

  return createPlanOrchestrationService({
    adapter,
    intentEngine,
    publicClients: config.publicClients,
    ...(config.deposit?.defaultSplit
      ? { defaultSplit: config.deposit.defaultSplit }
      : {}),
    ...(config.hyperliquid
      ? { hyperliquidNetwork: config.hyperliquid.network }
      : {}),
  });
}
