import { JobType } from '../../../../../src/modules/jobs/interfaces/job.interface';
import type { JobQueueService } from '../../../../../src/modules/jobs/job-queue.service';
import { StrategyChangeProcessor } from '../../../../../src/modules/jobs/processors/strategy-change.processor';
import type { StrategyChangeStateService } from '../../../../../src/modules/notifications/strategy-change-state.service';
import type { TelegramService } from '../../../../../src/modules/notifications/telegram.service';
import type { TrackRecordCurveService } from '../../../../../src/modules/notifications/track-record/client';
import type { EquityCurveSubset } from '../../../../../src/modules/notifications/track-record/schema';
import {
  createEquityCurveFixture,
  createJobFixture,
  createMockJobQueueService,
} from '../../../../test-utils';

const JOB = createJobFixture({ type: JobType.STRATEGY_CHANGE_BATCH });
const STRATEGY_ID = 'dma_fgi_portfolio_rules';

function createBroadcastResult(overrides: Record<string, unknown> = {}) {
  return {
    recipients: 2,
    sent: 2,
    skippedNoChatId: 0,
    skippedBlocked: 0,
    failedUserIds: [],
    ...overrides,
  };
}

function createMocks(
  options: {
    curve?: EquityCurveSubset;
    lastNotified?: string | null;
  } = {},
) {
  const jobQueueService = createMockJobQueueService();
  const curveService = {
    fetchCurve: vi
      .fn()
      .mockResolvedValue(options.curve ?? createEquityCurveFixture()),
  };
  const stateService = {
    getLastNotifiedEventDate: vi
      .fn()
      .mockResolvedValue(options.lastNotified ?? null),
    setLastNotifiedEventDate: vi.fn().mockResolvedValue(undefined),
  };
  const telegramService = {
    broadcastToConnectedUsers: vi
      .fn()
      .mockResolvedValue(createBroadcastResult()),
  };

  const processor = new StrategyChangeProcessor(
    jobQueueService as unknown as JobQueueService,
    curveService as unknown as TrackRecordCurveService,
    stateService as unknown as StrategyChangeStateService,
    telegramService as unknown as TelegramService,
  );

  return {
    processor,
    jobQueueService,
    curveService,
    stateService,
    telegramService,
  };
}

describe('StrategyChangeProcessor', () => {
  it('handles only the strategy-change batch job', () => {
    const { processor } = createMocks();

    expect(processor.supportedJobTypes).toEqual([
      JobType.STRATEGY_CHANGE_BATCH,
    ]);
  });

  it('announces the window-end trade on a first run without replaying history', async () => {
    const { processor, stateService, telegramService } = createMocks();

    const result = await processor.process(JOB);

    expect(result.success).toBe(true);
    expect(result.metadata).toMatchObject({
      strategyId: STRATEGY_ID,
      windowEnd: '2026-01-03',
      newEvents: 1,
      lastEventDate: '2026-01-03',
      recipients: 2,
      sent: 2,
    });
    const [message] = telegramService.broadcastToConnectedUsers.mock.calls[0]!;
    expect(message).toContain('📈 *Strategy Update — 2026-01-03*');
    expect(message).not.toContain('2026-01-02');
    expect(stateService.setLastNotifiedEventDate).toHaveBeenCalledWith(
      STRATEGY_ID,
      '2026-01-03',
    );
  });

  it('catches up on every trade after the stored cursor', async () => {
    const { processor, telegramService, stateService } = createMocks({
      lastNotified: '2026-01-01',
    });

    const result = await processor.process(JOB);

    expect(result.metadata).toMatchObject({ newEvents: 2 });
    const [message] = telegramService.broadcastToConnectedUsers.mock.calls[0]!;
    expect(message).toContain('2 trades through 2026-01-03');
    expect(stateService.setLastNotifiedEventDate).toHaveBeenCalledWith(
      STRATEGY_ID,
      '2026-01-03',
    );
  });

  it('stays silent when nothing traded since the last run', async () => {
    const { processor, telegramService, stateService, jobQueueService } =
      createMocks({ lastNotified: '2026-01-03' });

    const result = await processor.process(JOB);

    expect(result).toEqual({
      success: true,
      metadata: {
        strategyId: STRATEGY_ID,
        windowEnd: '2026-01-03',
        newEvents: 0,
      },
    });
    expect(telegramService.broadcastToConnectedUsers).not.toHaveBeenCalled();
    expect(stateService.setLastNotifiedEventDate).not.toHaveBeenCalled();
    expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
      JOB.id,
      'INFO',
      'No new strategy events through 2026-01-03',
    );
  });

  it('seeds the cursor on a first run whose window end carries no trade', async () => {
    const { processor, telegramService, stateService } = createMocks({
      curve: createEquityCurveFixture({ window: { end: '2026-01-04' } }),
    });

    const result = await processor.process(JOB);

    expect(result.metadata).toMatchObject({
      newEvents: 0,
      seededAt: '2026-01-03',
    });
    expect(telegramService.broadcastToConnectedUsers).not.toHaveBeenCalled();
    expect(stateService.setLastNotifiedEventDate).toHaveBeenCalledWith(
      STRATEGY_ID,
      '2026-01-03',
    );
  });

  it('does not seed a cursor for an artifact with no trades at all', async () => {
    const { processor, stateService } = createMocks({
      curve: createEquityCurveFixture({ events: [] }),
    });

    const result = await processor.process(JOB);

    expect(result.metadata).not.toHaveProperty('seededAt');
    expect(stateService.setLastNotifiedEventDate).not.toHaveBeenCalled();
  });

  it('advances the cursor when some recipients failed but others were reached', async () => {
    const { processor, stateService, telegramService } = createMocks();
    telegramService.broadcastToConnectedUsers.mockResolvedValue(
      createBroadcastResult({ sent: 1, failedUserIds: ['u-2'] }),
    );

    const result = await processor.process(JOB);

    expect(result.success).toBe(true);
    expect(result.metadata).toMatchObject({ sent: 1, failedUserIds: ['u-2'] });
    expect(stateService.setLastNotifiedEventDate).toHaveBeenCalled();
  });

  it('advances the cursor when there is nobody to notify', async () => {
    const { processor, stateService, telegramService } = createMocks();
    telegramService.broadcastToConnectedUsers.mockResolvedValue(
      createBroadcastResult({ recipients: 0, sent: 0 }),
    );

    const result = await processor.process(JOB);

    expect(result.success).toBe(true);
    expect(stateService.setLastNotifiedEventDate).toHaveBeenCalled();
  });

  it('fails the job and holds the cursor when every send errored', async () => {
    const { processor, stateService, telegramService, jobQueueService } =
      createMocks();
    telegramService.broadcastToConnectedUsers.mockResolvedValue(
      createBroadcastResult({ sent: 0, failedUserIds: ['u-1', 'u-2'] }),
    );

    const result = await processor.process(JOB);

    expect(result.success).toBe(false);
    expect(result.error).toContain('reached 0 of 2 users');
    expect(stateService.setLastNotifiedEventDate).not.toHaveBeenCalled();
    expect(jobQueueService.logJobEvent).toHaveBeenCalledWith(
      JOB.id,
      'ERROR',
      expect.stringContaining('reached 0 of 2 users'),
    );
  });

  it('fails the job and holds the cursor when the artifact cannot be read', async () => {
    const { processor, curveService, stateService, telegramService } =
      createMocks();
    curveService.fetchCurve.mockRejectedValue(new Error('502 bad gateway'));

    const result = await processor.process(JOB);

    expect(result).toEqual({ success: false, error: '502 bad gateway' });
    expect(telegramService.broadcastToConnectedUsers).not.toHaveBeenCalled();
    expect(stateService.setLastNotifiedEventDate).not.toHaveBeenCalled();
  });
});
