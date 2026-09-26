import {
  AGENT_RUN_STEP_IDS,
  AgentRunStatusSchema,
  type AgentRunStatus,
  type AgentRunStep,
  type AgentRunStepId,
} from '@zapengine/types/api';

export const RUN_EPISODE_ID = '0f85db1e-ae06-45ea-89a7-360ec63ff072';
export const RUN_DEPOSIT_HASH = `0x${'cd'.repeat(32)}`;

const STATE_ORDER = ['done', 'active', 'waiting'] as const;

/**
 * A status as `pnpm agent serve` reports it, parsed through the shared
 * contract so a fixture can never drift from what the app really receives.
 */
export function agentRunStatus(
  overrides: Partial<Omit<AgentRunStatus, 'steps'>> & {
    /** The step in progress; earlier steps are done, later ones wait. */
    activeStep?: AgentRunStepId;
    steps?: Partial<Record<AgentRunStepId, AgentRunStep>>;
  } = {},
): AgentRunStatus {
  const { activeStep, steps, ...rest } = overrides;
  const activeIndex =
    activeStep === undefined ? -1 : AGENT_RUN_STEP_IDS.indexOf(activeStep);
  const base = Object.fromEntries(
    AGENT_RUN_STEP_IDS.map((id, index) => {
      const order = Math.sign(index - activeIndex) + 1;
      const state = activeIndex < 0 ? 'waiting' : STATE_ORDER[order]!;
      return [id, { state, entries: [] }];
    }),
  );
  return AgentRunStatusSchema.parse({
    state: 'running',
    episode: RUN_EPISODE_ID,
    startedAt: 1_000,
    finishedAt: null,
    error: null,
    transaction: null,
    depositHash: null,
    ...rest,
    steps: { ...base, ...steps },
  });
}
