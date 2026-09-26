import type { PlanOrchestrationDepositReviewResponse } from '@zapengine/types/api';

import type { createChain } from '../lib/chain.js';
import type { TransactionSigner } from '../lib/multibaas.js';
import type { Action, Store } from './types.js';

export interface ExecutionDependencies {
  store: Store;
  signer: TransactionSigner;
  chain: ReturnType<typeof createChain>;
  review: (
    wallet: `0x${string}`,
  ) => Promise<PlanOrchestrationDepositReviewResponse>;
  wallet: `0x${string}`;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
export const leaseExpiry = (now: number) =>
  new Date(now + 120_000).toISOString();
export function executionContext(
  action: Action,
  dependencies: ExecutionDependencies,
) {
  const context = {
    action,
    d: dependencies,
    async save(patch: Partial<Action>) {
      const saved = await dependencies.store.cas(context.action, {
        ...patch,
        updated_at: new Date(dependencies.now()).toISOString(),
      });
      if (!saved) throw new Error('Claim lost; stop without submitting');
      context.action = saved;
    },
    async attention(reason: string) {
      await context.save({ status: 'needs_attention', last_error: reason });
    },
  };
  return context;
}
export type ExecutionContext = ReturnType<typeof executionContext>;
