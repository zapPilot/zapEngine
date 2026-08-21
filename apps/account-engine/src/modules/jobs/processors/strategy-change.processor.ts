import { Logger } from '../../../common/logger';
import {
  buildStrategyChangeMessage,
  latestEventDate,
  selectNewEvents,
} from '../../notifications/strategy-change-message.util';
import { StrategyChangeStateService } from '../../notifications/strategy-change-state.service';
import { TelegramService } from '../../notifications/telegram.service';
import { TrackRecordCurveService } from '../../notifications/track-record/client';
import {
  createJobFailureResult,
  Job,
  JobProcessingResult,
  JobProcessor,
  JobType,
  LogLevel,
} from '../interfaces/job.interface';
import { JobQueueService } from '../job-queue.service';

const LOG_LABEL = 'strategy change';

/**
 * Announces strategy trade events on Telegram.
 *
 * One job, no fan-out: the notification describes the strategy rather than any
 * user's portfolio, so the same text goes to every connected user and there is
 * nothing per-user to compute.
 *
 * Idempotent through `strategy_change_notification_state`: the cursor only
 * advances once a broadcast has actually reached someone, so a retry re-sends
 * the same events instead of skipping them.
 */
export class StrategyChangeProcessor implements JobProcessor {
  private readonly logger = new Logger(StrategyChangeProcessor.name);

  readonly supportedJobTypes = [JobType.STRATEGY_CHANGE_BATCH];

  /* istanbul ignore next -- DI constructor */
  constructor(
    private readonly jobQueueService: JobQueueService,
    private readonly trackRecordCurveService: TrackRecordCurveService,
    private readonly strategyChangeStateService: StrategyChangeStateService,
    private readonly telegramService: TelegramService,
  ) {}

  async process(job: Job): Promise<JobProcessingResult> {
    try {
      const curve = await this.trackRecordCurveService.fetchCurve();
      const strategyId = curve.eventsMeta.strategyId;
      const lastNotified =
        await this.strategyChangeStateService.getLastNotifiedEventDate(
          strategyId,
        );
      const newEvents = selectNewEvents(curve, lastNotified);

      if (newEvents.length === 0) {
        return await this.reportNoChange(job, {
          strategyId,
          windowEnd: curve.window.end,
          seedDate: lastNotified === null ? latestEventDate(curve) : null,
        });
      }

      const lastEventDate = newEvents[newEvents.length - 1]!.date;
      const broadcast = await this.telegramService.broadcastToConnectedUsers(
        buildStrategyChangeMessage(curve, newEvents),
        LOG_LABEL,
      );

      // Nobody reachable at all is a success — the cursor should advance past
      // events that have no audience. Reaching nobody *because every send
      // errored* is a transport failure, so the cursor stays put and the retry
      // re-sends these same events.
      if (broadcast.sent === 0 && broadcast.failedUserIds.length > 0) {
        const error = `Strategy change broadcast reached 0 of ${broadcast.recipients} users`;
        this.jobQueueService.logJobEvent(job.id, LogLevel.ERROR, error);
        return { success: false, error };
      }

      await this.strategyChangeStateService.setLastNotifiedEventDate(
        strategyId,
        lastEventDate,
      );

      this.jobQueueService.logJobEvent(
        job.id,
        LogLevel.INFO,
        `Announced ${newEvents.length} strategy event(s) through ${lastEventDate} to ${broadcast.sent} user(s)`,
      );

      return {
        success: true,
        metadata: {
          strategyId,
          windowEnd: curve.window.end,
          newEvents: newEvents.length,
          lastEventDate,
          recipients: broadcast.recipients,
          sent: broadcast.sent,
          skippedNoChatId: broadcast.skippedNoChatId,
          skippedBlocked: broadcast.skippedBlocked,
          failedUserIds: broadcast.failedUserIds,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}`, error);
      return createJobFailureResult(error);
    }
  }

  /**
   * No new events. On a first-ever run that also means seeding the cursor to
   * the artifact's newest event, so a later run cannot mistake the whole
   * history for news.
   */
  private async reportNoChange(
    job: Job,
    context: {
      strategyId: string;
      windowEnd: string;
      seedDate: string | null;
    },
  ): Promise<JobProcessingResult> {
    if (context.seedDate !== null) {
      await this.strategyChangeStateService.setLastNotifiedEventDate(
        context.strategyId,
        context.seedDate,
      );
    }

    this.jobQueueService.logJobEvent(
      job.id,
      LogLevel.INFO,
      `No new strategy events through ${context.windowEnd}`,
    );

    return {
      success: true,
      metadata: {
        strategyId: context.strategyId,
        windowEnd: context.windowEnd,
        newEvents: 0,
        ...(context.seedDate === null ? {} : { seededAt: context.seedDate }),
      },
    };
  }
}
