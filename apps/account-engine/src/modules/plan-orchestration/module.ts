import { createIntentEngine, LiFiAdapter } from '@zapengine/intent-engine';

import type { DepositPublicClients } from './publicClients';
import {
  createPlanOrchestrationService,
  type PlanOrchestrationService,
} from './service';

export interface PlanOrchestrationModuleConfig {
  lifi: {
    integrator: string;
    apiKey?: string;
  };
  publicClients: DepositPublicClients;
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
  });
}
