import { claim } from './execution-claim.js';
import {
  executionContext,
  type ExecutionDependencies,
} from './execution-context.js';
import { executeStep } from './execution-step.js';
import type { Action } from './types.js';

export async function execute(
  initial: Action,
  dependencies: ExecutionDependencies,
  dryRun = false,
): Promise<void> {
  const context = executionContext(initial, dependencies);
  if (!(await claim(context, dryRun))) return;
  const { action, d } = context;
  if (
    !action.review ||
    action.wallet_address?.toLowerCase() !== d.wallet.toLowerCase()
  ) {
    await context.attention('Missing review or wallet mismatch');
    return;
  }
  const plan = action.review.plan;
  if ('executionGroups' in plan) {
    await context.attention('Unexpected persisted plan');
    return;
  }
  const transactions = [...plan.approvals, ...plan.calls];
  if (!transactions.length || action.steps.length > transactions.length) {
    await context.attention('Invalid persisted step count');
    return;
  }
  try {
    for (const [index, tx] of transactions.entries())
      if (!(await executeStep(context, tx, index))) return;
    await context.save({ status: 'confirmed', last_error: null });
  } catch {
    // Submit timeouts cannot establish whether a transaction exists.
    await context.attention(
      'Execution interrupted; inspect persisted nonce and TXM before manual recovery',
    );
  }
}
