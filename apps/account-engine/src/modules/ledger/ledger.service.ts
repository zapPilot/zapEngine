import { BaseService } from '../../database/base.service';
import {
  type DecisionEventInput,
  DecisionEventInputSchema,
  type ExecutionEventInput,
  ExecutionEventInputSchema,
  type LedgerEventRef,
  type PlanEventInput,
  PlanEventInputSchema,
  type SignalEventInput,
  SignalEventInputSchema,
} from './schema';

interface LedgerRow {
  id: string;
  inserted_at: string;
}

/**
 * Append-only strategy ledger (ADR 0002 D5 phase 1): signal → decision →
 * plan → execution events are the source of truth; snapshots are projections.
 * Rows are insert-only — the tables revoke UPDATE/DELETE and carry a guard
 * trigger — so this service intentionally exposes no update or delete.
 * Writes use the service-role client: events are produced by server-side
 * flows (jobs, plan-orchestration callers), never by end-user requests.
 */
export class LedgerService extends BaseService {
  async appendSignalEvent(input: SignalEventInput): Promise<LedgerEventRef> {
    return this.withErrorHandling(async () => {
      const parsed = SignalEventInputSchema.parse(input);
      return this.appendEvent('ledger_signal_events', 'Signal event', {
        source: parsed.source,
        signal_type: parsed.signalType,
        ...this.baseColumns(parsed),
      });
    }, 'append signal event');
  }

  async appendDecisionEvent(
    input: DecisionEventInput,
  ): Promise<LedgerEventRef> {
    return this.withErrorHandling(async () => {
      const parsed = DecisionEventInputSchema.parse(input);
      return this.appendEvent('ledger_decision_events', 'Decision event', {
        strategy_version: parsed.strategyVersion,
        config_identity: parsed.configIdentity,
        decision_type: parsed.decisionType,
        signal_event_id: parsed.signalEventId ?? null,
        user_id: parsed.userId ?? null,
        ...this.baseColumns(parsed),
      });
    }, 'append decision event');
  }

  async appendPlanEvent(input: PlanEventInput): Promise<LedgerEventRef> {
    return this.withErrorHandling(async () => {
      const parsed = PlanEventInputSchema.parse(input);
      return this.appendEvent('ledger_plan_events', 'Plan event', {
        plan_kind: parsed.planKind,
        decision_event_id: parsed.decisionEventId ?? null,
        user_id: parsed.userId ?? null,
        plan_hash: parsed.planHash ?? null,
        ...this.baseColumns(parsed),
      });
    }, 'append plan event');
  }

  async appendExecutionEvent(
    input: ExecutionEventInput,
  ): Promise<LedgerEventRef> {
    return this.withErrorHandling(async () => {
      const parsed = ExecutionEventInputSchema.parse(input);
      return this.appendEvent('ledger_execution_events', 'Execution event', {
        status: parsed.status,
        plan_event_id: parsed.planEventId ?? null,
        user_id: parsed.userId ?? null,
        chain_id: parsed.chainId ?? null,
        tx_hash: parsed.txHash ?? null,
        ...this.baseColumns(parsed),
      });
    }, 'append execution event');
  }

  private baseColumns(parsed: {
    occurredAt?: string;
    payload: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      ...(parsed.occurredAt ? { occurred_at: parsed.occurredAt } : {}),
      payload: parsed.payload,
    };
  }

  private async appendEvent(
    table: string,
    entityName: string,
    row: Record<string, unknown>,
  ): Promise<LedgerEventRef> {
    const inserted = await this.insertOne<LedgerRow>(table, row, {
      entityName,
      select: 'id, inserted_at',
      useServiceRole: true,
    });
    return { id: inserted.id, insertedAt: inserted.inserted_at };
  }
}
