import { z } from 'zod';

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

const eventBaseSchema = z.object({
  /** When the event happened in the domain; defaults to insert time in the DB. */
  occurredAt: z.iso.datetime().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const SignalEventInputSchema = eventBaseSchema.extend({
  source: z.string().min(1),
  signalType: z.string().min(1),
});
export type SignalEventInput = z.infer<typeof SignalEventInputSchema>;

export const DecisionEventInputSchema = eventBaseSchema.extend({
  strategyVersion: z.string().min(1),
  configIdentity: z.string().min(1),
  decisionType: z.string().min(1),
  signalEventId: z.uuid().optional(),
  userId: z.uuid().optional(),
});
export type DecisionEventInput = z.infer<typeof DecisionEventInputSchema>;

export const PlanEventInputSchema = eventBaseSchema.extend({
  planKind: z.enum(['deposit', 'withdraw', 'rebalance']),
  decisionEventId: z.uuid().optional(),
  userId: z.uuid().optional(),
  planHash: z.string().regex(TX_HASH_REGEX).optional(),
});
export type PlanEventInput = z.infer<typeof PlanEventInputSchema>;

export const ExecutionEventInputSchema = eventBaseSchema.extend({
  status: z.enum(['submitted', 'confirmed', 'failed', 'replaced']),
  planEventId: z.uuid().optional(),
  userId: z.uuid().optional(),
  chainId: z.number().int().positive().optional(),
  txHash: z.string().regex(TX_HASH_REGEX).optional(),
});
export type ExecutionEventInput = z.infer<typeof ExecutionEventInputSchema>;

/** Reference to an appended ledger row. */
export interface LedgerEventRef {
  id: string;
  insertedAt: string;
}
