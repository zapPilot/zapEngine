import { DatabaseService } from '../../../../src/database/database.service';
import { StrategyChangeStateService } from '../../../../src/modules/notifications/strategy-change-state.service';
import { createMockDatabaseService } from '../../../test-utils';

const STRATEGY_ID = 'dma_fgi_portfolio_rules';

function createService() {
  const dbMock = createMockDatabaseService();
  const service = new StrategyChangeStateService(
    dbMock.mock as unknown as DatabaseService,
  );

  return { service, dbMock };
}

describe('StrategyChangeStateService', () => {
  it('reads the stored cursor through the service-role client', async () => {
    const { service, dbMock } = createService();
    dbMock.supabase.queryBuilder.single.mockResolvedValue({
      data: { last_event_date: '2026-08-19' },
      error: null,
    });

    await expect(service.getLastNotifiedEventDate(STRATEGY_ID)).resolves.toBe(
      '2026-08-19',
    );
    expect(dbMock.supabase.client.from).toHaveBeenCalledWith(
      'strategy_change_notification_state',
    );
    expect(dbMock.supabase.queryBuilder.eq).toHaveBeenCalledWith(
      'strategy_id',
      STRATEGY_ID,
    );
  });

  it('reports no cursor when the strategy has never been announced', async () => {
    const { service, dbMock } = createService();
    dbMock.supabase.queryBuilder.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    await expect(
      service.getLastNotifiedEventDate(STRATEGY_ID),
    ).resolves.toBeNull();
  });

  it('upserts the cursor keyed on the strategy', async () => {
    const { service, dbMock } = createService();
    dbMock.supabase.queryBuilder.mockResolvedThen({
      data: null,
      error: null,
    });

    await service.setLastNotifiedEventDate(STRATEGY_ID, '2026-08-19');

    expect(dbMock.supabase.queryBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_id: STRATEGY_ID,
        last_event_date: '2026-08-19',
        updated_at: expect.any(String),
      }),
      { onConflict: 'strategy_id' },
    );
  });

  it('throws when the cursor cannot be advanced', async () => {
    const { service, dbMock } = createService();
    dbMock.supabase.queryBuilder.mockResolvedThen({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    await expect(
      service.setLastNotifiedEventDate(STRATEGY_ID, '2026-08-19'),
    ).rejects.toThrow();
  });
});
