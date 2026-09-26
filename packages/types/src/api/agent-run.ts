import { z } from 'zod';

/**
 * Progress of one local news-agent run (`pnpm agent serve`), shown by the AI
 * Wallet timeline. Display only: the run never reads it back.
 */
export const AGENT_RUN_STEP_IDS = [
  'news',
  'analyze',
  'intent',
  'compose',
  'sign',
  'confirm',
  'deliver',
] as const;

export const AGENT_RUN_TRANSACTION_KINDS = [
  'approve',
  'redeem',
  'swap',
  'deposit',
] as const;

const AgentRunLinkSchema = z
  .object({ label: z.string(), url: z.url({ protocol: /^https$/ }) })
  .strict();

const AgentRunEntrySchema = z
  .object({ text: z.string(), link: AgentRunLinkSchema.nullable() })
  .strict();

const AgentRunStepSchema = z
  .object({
    state: z.enum(['waiting', 'active', 'done', 'failed']),
    entries: z.array(AgentRunEntrySchema),
  })
  .strict();

/** The transaction steps 4–6 are working on, e.g. "Tx 3/5 · swap". */
const AgentRunTransactionSchema = z
  .object({
    kind: z.enum(AGENT_RUN_TRANSACTION_KINDS),
    index: z.number().int().positive(),
    total: z.number().int().positive(),
  })
  .strict()
  .refine((transaction) => transaction.index <= transaction.total, {
    message: 'index must not exceed total',
    path: ['index'],
  });

export const AgentRunStatusSchema = z
  .object({
    state: z.enum(['idle', 'running', 'succeeded', 'failed']),
    episode: z.string(),
    startedAt: z.number().nullable(),
    finishedAt: z.number().nullable(),
    error: z.string().nullable(),
    transaction: AgentRunTransactionSchema.nullable(),
    /** Set when the deposit is broadcast, before it is confirmed. */
    depositHash: z
      .string()
      .regex(/^0x[0-9a-fA-F]{64}$/)
      .nullable(),
    steps: z.record(z.enum(AGENT_RUN_STEP_IDS), AgentRunStepSchema),
  })
  .strict();

export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRunStepId = (typeof AGENT_RUN_STEP_IDS)[number];
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;
export type AgentRunEntry = z.infer<typeof AgentRunEntrySchema>;
export type AgentRunLink = z.infer<typeof AgentRunLinkSchema>;
export type AgentRunTransaction = z.infer<typeof AgentRunTransactionSchema>;
