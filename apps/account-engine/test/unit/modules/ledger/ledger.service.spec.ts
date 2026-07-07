import { ServiceLayerException } from '../../../../src/common/exceptions';
import { BadRequestException } from '../../../../src/common/http';
import { DatabaseService } from '../../../../src/database/database.service';
import { LedgerService } from '../../../../src/modules/ledger';
import { createMockDatabaseService } from '../../../test-utils';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const EVENT_ID = '323e4567-e89b-12d3-a456-426614174002';

function createLedger() {
  const dbMock = createMockDatabaseService();
  const service = new LedgerService(dbMock.mock as unknown as DatabaseService);
  return { service, dbMock, srQb: dbMock.serviceRole.queryBuilder };
}

function mockInsertedRow(
  srQb: ReturnType<typeof createLedger>['srQb'],
  id = EVENT_ID,
) {
  srQb.single.mockResolvedValue({
    data: { id, inserted_at: '2026-07-07T00:00:00.000Z' },
    error: null,
  });
}

describe('LedgerService', () => {
  describe('appendSignalEvent', () => {
    it('inserts an append-only signal event row via the service-role client', async () => {
      const { service, dbMock, srQb } = createLedger();
      mockInsertedRow(srQb);

      const result = await service.appendSignalEvent({
        source: 'analytics-engine',
        signalType: 'daily-suggestion',
        payload: { regime: 'risk-on' },
      });

      expect(result.id).toBe(EVENT_ID);
      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
        'ledger_signal_events',
      );
      expect(srQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'analytics-engine',
          signal_type: 'daily-suggestion',
          payload: { regime: 'risk-on' },
        }),
      );
    });

    it('rejects an empty source', async () => {
      const { service } = createLedger();

      await expect(
        service.appendSignalEvent({
          source: '',
          signalType: 'daily-suggestion',
          payload: {},
        }),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  describe('appendDecisionEvent', () => {
    it('inserts a decision event carrying strategyVersion and config identity', async () => {
      const { service, dbMock, srQb } = createLedger();
      mockInsertedRow(srQb);

      await service.appendDecisionEvent({
        strategyVersion: 'v1',
        configIdentity: 'balanced-2026-06',
        decisionType: 'rebalance',
        signalEventId: EVENT_ID,
        userId: USER_ID,
        payload: { targetWeights: { btc: 0.5 } },
      });

      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
        'ledger_decision_events',
      );
      expect(srQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy_version: 'v1',
          config_identity: 'balanced-2026-06',
          decision_type: 'rebalance',
          signal_event_id: EVENT_ID,
          user_id: USER_ID,
        }),
      );
    });

    it('rejects a decision event without a strategyVersion', async () => {
      const { service, srQb } = createLedger();

      await expect(
        service.appendDecisionEvent({
          strategyVersion: '',
          configIdentity: 'balanced-2026-06',
          decisionType: 'rebalance',
          payload: {},
        }),
      ).rejects.toThrow(ServiceLayerException);
      expect(srQb.insert).not.toHaveBeenCalled();
    });
  });

  describe('appendPlanEvent', () => {
    it('inserts a plan event linked to its decision', async () => {
      const { service, dbMock, srQb } = createLedger();
      mockInsertedRow(srQb);

      await service.appendPlanEvent({
        planKind: 'rebalance',
        decisionEventId: EVENT_ID,
        userId: USER_ID,
        planHash: `0x${'ab'.repeat(32)}`,
        payload: { legs: [] },
      });

      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
        'ledger_plan_events',
      );
      expect(srQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_kind: 'rebalance',
          decision_event_id: EVENT_ID,
          plan_hash: `0x${'ab'.repeat(32)}`,
        }),
      );
    });

    it('rejects an unknown plan kind', async () => {
      const { service } = createLedger();

      await expect(
        service.appendPlanEvent({
          planKind: 'yolo' as never,
          payload: {},
        }),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  describe('appendExecutionEvent', () => {
    it('inserts an execution event with chain and tx metadata', async () => {
      const { service, dbMock, srQb } = createLedger();
      mockInsertedRow(srQb);

      await service.appendExecutionEvent({
        status: 'submitted',
        planEventId: EVENT_ID,
        userId: USER_ID,
        chainId: 8453,
        txHash: `0x${'cd'.repeat(32)}`,
        payload: { legIndex: 0 },
      });

      expect(dbMock.serviceRole.client.from).toHaveBeenCalledWith(
        'ledger_execution_events',
      );
      expect(srQb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'submitted',
          plan_event_id: EVENT_ID,
          chain_id: 8453,
          tx_hash: `0x${'cd'.repeat(32)}`,
        }),
      );
    });

    it('rejects a malformed transaction hash', async () => {
      const { service } = createLedger();

      await expect(
        service.appendExecutionEvent({
          status: 'submitted',
          txHash: '0x1234',
          payload: {},
        }),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  it('honours an explicit occurredAt while inserted_at stays server-side', async () => {
    const { service, srQb } = createLedger();
    mockInsertedRow(srQb);

    await service.appendSignalEvent({
      source: 'analytics-engine',
      signalType: 'regime-state',
      occurredAt: '2026-07-06T12:00:00.000Z',
      payload: {},
    });

    expect(srQb.insert).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: '2026-07-06T12:00:00.000Z' }),
    );
    expect(srQb.insert).toHaveBeenCalledWith(
      expect.not.objectContaining({ inserted_at: expect.anything() }),
    );
  });

  it('propagates insert failures as HTTP-mapped exceptions', async () => {
    const { service, srQb } = createLedger();
    srQb.single.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    await expect(
      service.appendSignalEvent({
        source: 'analytics-engine',
        signalType: 'daily-suggestion',
        payload: {},
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
