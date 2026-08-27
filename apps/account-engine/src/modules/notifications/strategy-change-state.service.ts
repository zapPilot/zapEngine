/**
 * How far the strategy-change notifier has already announced, per strategy.
 *
 * A single row of bookkeeping rather than a per-user cursor: one strategy event
 * produces one broadcast, so what has to be remembered is the event, not who
 * received it.
 */

import { BaseService } from '../../database/base.service';
import { DatabaseService } from '../../database/database.service';
import { SupabaseErrorHandler } from '../../database/supabase-error.handler';

const STATE_TABLE = 'strategy_change_notification_state';
const ENTITY_NAME = 'Strategy change notification state';

interface StrategyChangeStateRow {
  last_event_date: string;
}

export class StrategyChangeStateService extends BaseService {
  /* istanbul ignore next -- DI constructor */
  constructor(databaseService: DatabaseService) {
    super(databaseService);
  }

  /** Null on the first ever run for a strategy — never notified anything yet. */
  async getLastNotifiedEventDate(strategyId: string): Promise<string | null> {
    const row = await this.findOne<StrategyChangeStateRow>(
      STATE_TABLE,
      { strategy_id: strategyId },
      {
        select: 'last_event_date',
        entityName: ENTITY_NAME,
        throwOnNotFound: false,
      },
    );

    return row?.last_event_date ?? null;
  }

  /**
   * Raw upsert: BaseService has no upsert surface, and the table is keyed on
   * strategy_id so insert-or-advance is one statement.
   *
   * Throws on failure on purpose — a silently unadvanced cursor would re-send
   * the same trades on the next run.
   */
  async setLastNotifiedEventDate(
    strategyId: string,
    lastEventDate: string,
  ): Promise<void> {
    const result = await this.supabase.from(STATE_TABLE as never).upsert(
      {
        strategy_id: strategyId,
        last_event_date: lastEventDate,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'strategy_id' },
    );

    SupabaseErrorHandler.validateOperation(
      result,
      `record ${ENTITY_NAME.toLowerCase()}`,
      ENTITY_NAME,
    );
  }
}
