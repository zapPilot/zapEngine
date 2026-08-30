import { toError } from '../lib/errorMessage.js';
import {
  flyImageRefsMatch,
  type FlyMachinesClient,
  type FlyMachineSummary,
} from './fly-machines.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
} from './supabase-client.js';
import {
  buildTelegramRenderFleetWarningMessage,
  buildTelegramRenderWakeFailedMessage,
  sendTelegramNotification,
  type TelegramChatId,
} from './telegram.js';
import { EPISODE_VIDEO_VISUAL_VERSION } from './video-jobs.js';

/**
 * Keeps the on-demand `render` Fly process group alive exactly as long as there
 * is work it can actually claim. It runs in the always-on `app` process: the
 * worker stops itself on an idle queue (src/worker.ts) and this is the only
 * thing that starts it again.
 *
 * The pending-work test below MIRRORS the WHERE clauses of
 * `claim_episode_video_v2` / `claim_episode_video_visual_v2`
 * (apps/podcast-pipeline/supabase/schema.sql). Loosening it here without
 * loosening the claim RPCs makes the group wake, claim nothing, idle out and
 * wake again; tightening it below the claim RPCs strands jobs on a stopped
 * machine. Change both together.
 */

export const RENDER_PROCESS_GROUP = 'render';
export const RENDER_CAPACITY_POLL_INTERVAL_MS = 30_000;
/** Wakes allowed on an unchanged backlog before the repeat guard trips. */
export const RENDER_CAPACITY_MAX_REPEATED_WAKES = 3;
export const RENDER_CAPACITY_MAX_API_FAILURES = 3;

// Mirrors `attempt_count < 3` in both claim RPCs.
const MAX_JOB_ATTEMPTS = 3;

const WAKEABLE_MACHINE_STATES = new Set(['stopped', 'suspended']);
// 'failed' is carried so the unnotified-failure sweep can be detected; it is
// never claimable on its own.
const ACTIVE_JOB_STATUSES = ['queued', 'processing', 'failed'];

const VISUAL_WORK_FIELDS =
  'episode_id, status, visual_version, visual_hash, next_attempt_at, attempt_count, lease_expires_at, telegram_chat_id';
const VIDEO_WORK_FIELDS =
  'episode_localization_id, episode_id, status, visual_version, visual_hash, next_attempt_at, attempt_count, lease_expires_at, telegram_chat_id, failure_notified_at';

/** The lifecycle columns `episode_video_visuals` and `episode_videos` share. */
interface JobLifecycleColumns {
  episode_id: string;
  status: string;
  visual_version: string;
  visual_hash: string | null;
  next_attempt_at: string;
  attempt_count: number;
  lease_expires_at: string | null;
  telegram_chat_id: string | null;
}

export type VisualWorkRow = JobLifecycleColumns;

export interface VideoWorkRow extends JobLifecycleColumns {
  episode_localization_id: string;
  failure_notified_at: string | null;
}

export interface RenderWorkSnapshot {
  /** Active visual rows plus the visual row of every episode with active video work. */
  visuals: readonly VisualWorkRow[];
  videos: readonly VideoWorkRow[];
  nowMs: number;
}

export interface PendingRenderWork {
  /** Stable, time-independent ids — also the fingerprint the repeat guard uses. */
  reasons: readonly string[];
  telegramChatId: string | null;
}

export interface RenderWorkProbe {
  loadSnapshot(): Promise<RenderWorkSnapshot>;
}

export type RenderCapacityOutcome =
  | 'idle'
  | 'render-running'
  | 'started'
  | 'no-render-machines'
  | 'wake-suppressed'
  | 'error';

export interface RenderCapacityReconciler {
  start(): void;
  runOnce(): Promise<RenderCapacityOutcome>;
  stop(): void;
}

export interface CreateRenderCapacityReconcilerOptions {
  machines: FlyMachinesClient;
  currentImageRef: string;
  probe?: RenderWorkProbe;
  notify?: (chatId: TelegramChatId, text: string) => Promise<void>;
  pollIntervalMs?: number;
  logger?: Pick<Console, 'info' | 'error'>;
}

export function evaluatePendingRenderWork(
  snapshot: RenderWorkSnapshot,
): PendingRenderWork | null {
  const visualByEpisodeId = new Map(
    snapshot.visuals.map((visual) => [visual.episode_id, visual]),
  );
  const reasons: string[] = [];
  const chatIds: (string | null)[] = [];

  for (const visual of snapshot.visuals) {
    const reason = visualWorkReason(visual, snapshot.nowMs);
    if (!reason) continue;
    reasons.push(`${reason}:${visual.episode_id}`);
    chatIds.push(visual.telegram_chat_id);
  }

  for (const video of snapshot.videos) {
    const reason = videoWorkReason(video, visualByEpisodeId, snapshot.nowMs);
    if (!reason) continue;
    reasons.push(`${reason}:${video.episode_localization_id}`);
    chatIds.push(video.telegram_chat_id);
  }

  if (reasons.length === 0) return null;
  // Sorted so the repeat guard compares backlogs, not row order.
  reasons.sort((left, right) => left.localeCompare(right));
  return {
    reasons,
    telegramChatId: chatIds.find((chatId) => chatId != null) ?? null,
  };
}

/** Without a client the default one is built on first use, so constructing a
 * reconciler never requires Supabase credentials to be present. */
export function createRenderWorkProbe(
  client?: PipelineSupabaseClient,
): RenderWorkProbe {
  return {
    async loadSnapshot(): Promise<RenderWorkSnapshot> {
      const supabase = client ?? getPipelineSupabase();
      const [videos, visuals] = await Promise.all([
        selectRows<VideoWorkRow>(
          supabase
            .from('episode_videos')
            .select(VIDEO_WORK_FIELDS)
            .in('status', ACTIVE_JOB_STATUSES)
            .returns<VideoWorkRow[]>(),
        ),
        selectRows<VisualWorkRow>(
          supabase
            .from('episode_video_visuals')
            .select(VISUAL_WORK_FIELDS)
            .in('status', ACTIVE_JOB_STATUSES)
            .returns<VisualWorkRow[]>(),
        ),
      ]);

      // A queued render job is only claimable once its episode's visual row is
      // completed, and a completed row is excluded by the status filter above.
      const seenEpisodeIds = new Set(
        visuals.map((visual) => visual.episode_id),
      );
      const missingEpisodeIds = [
        ...new Set(
          videos
            .map((video) => video.episode_id)
            .filter((episodeId) => !seenEpisodeIds.has(episodeId)),
        ),
      ];
      const completedVisuals =
        missingEpisodeIds.length === 0
          ? []
          : await selectRows<VisualWorkRow>(
              supabase
                .from('episode_video_visuals')
                .select(VISUAL_WORK_FIELDS)
                .in('episode_id', missingEpisodeIds)
                .returns<VisualWorkRow[]>(),
            );

      return {
        visuals: [...visuals, ...completedVisuals],
        videos,
        nowMs: Date.now(),
      };
    },
  };
}

export function createRenderCapacityReconciler(
  options: CreateRenderCapacityReconcilerOptions,
): RenderCapacityReconciler {
  const machines = options.machines;
  const currentImageRef = options.currentImageRef;
  const probe = options.probe ?? createRenderWorkProbe();
  const notify = options.notify ?? sendTelegramNotification;
  const pollIntervalMs =
    options.pollIntervalMs ?? RENDER_CAPACITY_POLL_INTERVAL_MS;
  const logger = options.logger ?? console;

  let timer: NodeJS.Timeout | null = null;
  let started = false;
  let stopped = false;
  let running = false;
  let lastFingerprint: string | null = null;
  let repeatedWakes = 0;
  let suppressionNotified = false;
  let apiFailures = 0;
  let apiFailureNotified = false;
  let missingMachinesNotified = false;
  let unhealthyInventoryNotified = false;

  const warn = async (
    chatId: string | null,
    text: string,
    logLine: string,
  ): Promise<void> => {
    logger.error(logLine);
    if (!chatId) return;
    await notify(chatId, text);
  };

  const recordApiFailure = async (
    error: unknown,
    pending: PendingRenderWork,
  ): Promise<RenderCapacityOutcome> => {
    apiFailures += 1;
    logger.error(
      `[render-capacity] Fly Machines API call failed (${apiFailures}/${RENDER_CAPACITY_MAX_API_FAILURES})`,
      toError(error),
    );
    if (
      apiFailures >= RENDER_CAPACITY_MAX_API_FAILURES &&
      !apiFailureNotified
    ) {
      apiFailureNotified = true;
      await warn(
        pending.telegramChatId,
        buildTelegramRenderWakeFailedMessage(toError(error).message),
        '[render-capacity] render machine cannot be woken; video work is stalled',
      );
    }
    return 'error';
  };

  const selectCurrentMachines = async (
    renderMachines: readonly FlyMachineSummary[],
    pending: PendingRenderWork,
  ): Promise<FlyMachineSummary[] | null> => {
    const currentMachines = renderMachines
      .filter((machine) => flyImageRefsMatch(machine.image, currentImageRef))
      .sort((left, right) => left.id.localeCompare(right.id));
    const staleMachines = renderMachines.filter(
      (machine) => !flyImageRefsMatch(machine.image, currentImageRef),
    );

    if (currentMachines.length === 0) {
      if (!missingMachinesNotified) {
        missingMachinesNotified = true;
        const detail = describeMissingCurrentMachine(
          renderMachines.length,
          staleMachines.length,
        );
        await warn(
          pending.telegramChatId,
          buildTelegramRenderWakeFailedMessage(detail),
          `[render-capacity] ${detail}; video work is stalled`,
        );
      }
      return null;
    }
    missingMachinesNotified = false;

    if (currentMachines.length > 1 || staleMachines.length > 0) {
      if (!unhealthyInventoryNotified) {
        unhealthyInventoryNotified = true;
        const detail = `render fleet has ${describeMachineCount(currentMachines.length, 'current-release')} and ${describeMachineCount(staleMachines.length, 'stale')}`;
        await warn(
          pending.telegramChatId,
          buildTelegramRenderFleetWarningMessage(detail),
          `[render-capacity] ${detail}; wake continues on the current release`,
        );
      }
    } else {
      unhealthyInventoryNotified = false;
    }

    return currentMachines;
  };

  const runOnce = async (): Promise<RenderCapacityOutcome> => {
    let pending: PendingRenderWork | null;
    try {
      pending = evaluatePendingRenderWork(await probe.loadSnapshot());
    } catch (error) {
      logger.error(
        '[render-capacity] pending work lookup failed',
        toError(error),
      );
      return 'error';
    }

    if (!pending) {
      lastFingerprint = null;
      repeatedWakes = 0;
      suppressionNotified = false;
      return 'idle';
    }

    let renderMachines;
    try {
      renderMachines = (await machines.listMachines()).filter(
        (machine) => machine.processGroup === RENDER_PROCESS_GROUP,
      );
    } catch (error) {
      return await recordApiFailure(error, pending);
    }
    apiFailures = 0;
    apiFailureNotified = false;

    const currentMachines = await selectCurrentMachines(
      renderMachines,
      pending,
    );
    if (!currentMachines) return 'no-render-machines';

    // Already rendering. Deliberately not counted by the repeat guard: the group
    // is making progress, and a long render would otherwise look like thrash.
    if (renderMachines.some((machine) => machine.state === 'started')) {
      return 'render-running';
    }

    const fingerprint = pending.reasons.join('|');
    if (fingerprint === lastFingerprint) {
      repeatedWakes += 1;
    } else {
      lastFingerprint = fingerprint;
      repeatedWakes = 1;
      suppressionNotified = false;
    }

    if (repeatedWakes > RENDER_CAPACITY_MAX_REPEATED_WAKES) {
      if (!suppressionNotified) {
        suppressionNotified = true;
        await warn(
          pending.telegramChatId,
          buildTelegramRenderWakeFailedMessage(
            'render machine woke repeatedly without claiming the queued work',
          ),
          `[render-capacity] wake suppressed after ${RENDER_CAPACITY_MAX_REPEATED_WAKES} attempts on an unchanged backlog: ${fingerprint}`,
        );
      }
      return 'wake-suppressed';
    }

    // One machine is enough — heavyWorkCoordinator runs a single job at a time,
    // so waking more would only add cost. Two `app` machines racing to start the
    // same one is harmless: a repeated start does not boot it twice.
    const target =
      currentMachines.find((machine) =>
        WAKEABLE_MACHINE_STATES.has(machine.state),
      ) ?? currentMachines[0]!;
    try {
      await machines.startMachine(target.id);
    } catch (error) {
      return await recordApiFailure(error, pending);
    }

    logger.info(
      `[render-capacity] wake machine=${target.id} attempt=${repeatedWakes} work=${fingerprint}`,
    );
    return 'started';
  };

  const tick = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      await runOnce();
    } catch (error) {
      logger.error('[render-capacity] poll failed', toError(error));
    } finally {
      running = false;
    }
  };

  return {
    start(): void {
      if (started || stopped) return;
      started = true;
      logger.info(
        `[render-capacity] watching render work every ${pollIntervalMs}ms`,
      );
      void tick();
      timer = setInterval(() => void tick(), pollIntervalMs);
      timer.unref();
    },

    runOnce,

    stop(): void {
      stopped = true;
      started = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

function describeMissingCurrentMachine(
  renderMachineCount: number,
  staleMachineCount: number,
): string {
  if (renderMachineCount === 0) {
    return 'Fly app has no machine in the render process group';
  }
  return `Fly app has no render machine for the current release (${describeMachineCount(staleMachineCount, 'stale')} exist)`;
}

function describeMachineCount(count: number, qualifier: string): string {
  const noun = count === 1 ? 'machine' : 'machines';
  return `${count} ${qualifier} ${noun}`;
}

function visualWorkReason(
  visual: VisualWorkRow,
  nowMs: number,
): 'visual:queued' | 'visual:orphaned' | null {
  if (isClaimable(visual, nowMs)) return 'visual:queued';
  if (isOrphaned(visual, nowMs)) return 'visual:orphaned';
  return null;
}

function videoWorkReason(
  video: VideoWorkRow,
  visualByEpisodeId: ReadonlyMap<string, VisualWorkRow>,
  nowMs: number,
): 'video:queued' | 'video:orphaned' | 'video:unnotified-failure' | null {
  if (
    isClaimable(video, nowMs) &&
    hasMatchingCompletedVisual(video, visualByEpisodeId)
  ) {
    return 'video:queued';
  }
  if (isOrphaned(video, nowMs)) return 'video:orphaned';
  if (
    video.status === 'failed' &&
    video.telegram_chat_id != null &&
    video.failure_notified_at == null
  ) {
    // Only the worker's poll loop runs the Telegram failure sweep, so an
    // undelivered notice is itself a reason to bring the group back.
    return 'video:unnotified-failure';
  }
  return null;
}

function isClaimable(
  job: Pick<
    JobLifecycleColumns,
    'status' | 'attempt_count' | 'visual_version' | 'next_attempt_at'
  >,
  nowMs: number,
): boolean {
  return (
    job.status === 'queued' &&
    job.attempt_count < MAX_JOB_ATTEMPTS &&
    job.visual_version === EPISODE_VIDEO_VISUAL_VERSION &&
    toEpochMs(job.next_attempt_at) <= nowMs
  );
}

/**
 * A `processing` row whose lease has expired is reaped back to `queued` by the
 * claim RPCs themselves — nothing else in the system touches it. Without this,
 * a render machine killed mid-job would leave work no one ever wakes for.
 */
function isOrphaned(
  job: Pick<JobLifecycleColumns, 'status' | 'lease_expires_at'>,
  nowMs: number,
): boolean {
  return (
    job.status === 'processing' &&
    job.lease_expires_at != null &&
    toEpochMs(job.lease_expires_at) <= nowMs
  );
}

function hasMatchingCompletedVisual(
  video: VideoWorkRow,
  visualByEpisodeId: ReadonlyMap<string, VisualWorkRow>,
): boolean {
  if (!video.visual_hash) return false;
  const visual = visualByEpisodeId.get(video.episode_id);
  return (
    visual?.status === 'completed' &&
    visual.visual_hash === video.visual_hash &&
    visual.visual_version === video.visual_version
  );
}

function toEpochMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  // An unparseable timestamp must not read as "ready now": that would wake the
  // render group for a row the claim RPC will never hand out.
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

async function selectRows<T>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : ((error as { message?: string }).message ??
          'Supabase render work query failed');
    throw new Error(message, { cause: error });
  }
  return data ?? [];
}
