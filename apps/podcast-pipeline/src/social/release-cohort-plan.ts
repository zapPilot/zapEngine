import { SOCIAL_RELEASE_SLOTS } from './policy.js';
import { nextReleaseSlot, occupiesReleaseBudget } from './slot-policy.js';

const JST_OFFSET_MS = 9 * 60 * 60_000;

export type ReleaseScheduleStatus =
  | 'queued'
  | 'failed'
  | 'processing'
  | 'completed';

export interface ReleaseScheduleRow {
  id: string;
  episode_id: string;
  status: ReleaseScheduleStatus;
  scheduled_at: string;
  next_attempt_at: string;
  completed_at: string | null;
}

export interface ReleaseScheduleUpdate {
  id: string;
  episodeId: string;
  status: 'queued' | 'failed';
  scheduledAt: string;
  nextAttemptAt: string;
  reason: 'recovery' | 'reschedule';
}

export interface ReleaseCohortPlan {
  updates: ReleaseScheduleUpdate[];
  recoveryEpisodes: string[];
}

function earliestSchedule(rows: readonly ReleaseScheduleRow[]): Date {
  return new Date(Math.min(...rows.map((row) => Date.parse(row.scheduled_at))));
}

function releaseAnchor(rows: readonly ReleaseScheduleRow[]): Date {
  const times = rows.flatMap((row) => {
    const scheduledAt = Date.parse(row.scheduled_at);
    if (row.status !== 'completed' || !row.completed_at) return [scheduledAt];
    return [scheduledAt, Date.parse(row.completed_at)];
  });
  return new Date(Math.min(...times));
}

function isConfiguredArticleSlot(date: Date): boolean {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return SOCIAL_RELEASE_SLOTS.some(
    (slot) =>
      slot.hour === jst.getUTCHours() && slot.minute === jst.getUTCMinutes(),
  );
}

function pendingUpdates(
  rows: readonly ReleaseScheduleRow[],
  scheduledAt: Date,
  reason: ReleaseScheduleUpdate['reason'],
): ReleaseScheduleUpdate[] {
  const scheduledAtIso = scheduledAt.toISOString();
  return rows.flatMap((row) => {
    if (row.status !== 'queued' && row.status !== 'failed') return [];
    const nextAttemptAt =
      row.status === 'failed' &&
      Date.parse(row.next_attempt_at) > scheduledAt.getTime()
        ? row.next_attempt_at
        : scheduledAtIso;
    if (
      row.scheduled_at === scheduledAtIso &&
      row.next_attempt_at === nextAttemptAt
    ) {
      return [];
    }
    return [
      {
        id: row.id,
        episodeId: row.episode_id,
        status: row.status,
        scheduledAt: scheduledAtIso,
        nextAttemptAt,
        reason,
      },
    ];
  });
}

function occupiedArticleDates(
  byEpisode: ReadonlyMap<string, readonly ReleaseScheduleRow[]>,
): Date[] {
  const dates: Date[] = [];
  for (const rows of byEpisode.values()) {
    const processing = rows.find((row) => row.status === 'processing');
    if (processing) {
      dates.push(new Date(processing.scheduled_at));
      continue;
    }
    const completed = rows.find(
      (row) => row.status === 'completed' && occupiesReleaseBudget(row),
    );
    if (completed) dates.push(new Date(completed.scheduled_at));
  }
  return dates;
}

function canKeepExistingSlot(
  scheduledAt: Date,
  scheduledArticles: readonly Date[],
): boolean {
  if (!isConfiguredArticleSlot(scheduledAt)) return false;
  return (
    nextReleaseSlot({
      after: scheduledAt,
      scheduled: scheduledArticles,
      horizonDays: 1,
    })?.getTime() === scheduledAt.getTime()
  );
}

/**
 * Pure planner for durable queue reconciliation. Database code applies these
 * updates with status CAS fences; this function owns all product decisions.
 */
export function planPendingSocialReleaseCohorts(
  rows: readonly ReleaseScheduleRow[],
  now: Date,
  graceMs: number,
): ReleaseCohortPlan {
  const byEpisode = new Map<string, ReleaseScheduleRow[]>();
  for (const row of rows) {
    const group = byEpisode.get(row.episode_id) ?? [];
    group.push(row);
    byEpisode.set(row.episode_id, group);
  }

  const updates: ReleaseScheduleUpdate[] = [];
  const recoveryEpisodes: string[] = [];
  const unpublished: {
    episodeId: string;
    rows: ReleaseScheduleRow[];
    earliest: Date;
  }[] = [];

  for (const [episodeId, group] of byEpisode) {
    const hasCompleted = group.some((row) => row.status === 'completed');
    const hasPending = group.some((row) => row.status !== 'completed');
    if (!hasPending) continue;

    if (hasCompleted) recoveryEpisodes.push(episodeId);
    if (group.some((row) => row.status === 'processing')) continue;

    if (hasCompleted) {
      updates.push(...pendingUpdates(group, releaseAnchor(group), 'recovery'));
      continue;
    }

    unpublished.push({
      episodeId,
      rows: group,
      earliest: earliestSchedule(group),
    });
  }

  unpublished.sort(
    (left, right) => left.earliest.getTime() - right.earliest.getTime(),
  );
  const scheduledArticles = occupiedArticleDates(byEpisode);

  for (const cohort of unpublished) {
    const uniqueTimes = new Set(cohort.rows.map((row) => row.scheduled_at));
    const alreadyAligned = uniqueTimes.size === 1;
    const stillWithinGrace =
      cohort.earliest.getTime() >= now.getTime() - graceMs;
    if (
      alreadyAligned &&
      stillWithinGrace &&
      canKeepExistingSlot(cohort.earliest, scheduledArticles)
    ) {
      scheduledArticles.push(cohort.earliest);
      continue;
    }

    const after = new Date(Math.max(cohort.earliest.getTime(), now.getTime()));
    const scheduledAt = nextReleaseSlot({
      after,
      scheduled: scheduledArticles,
      horizonDays: 366,
    });
    if (!scheduledAt) continue;
    scheduledArticles.push(scheduledAt);
    updates.push(...pendingUpdates(cohort.rows, scheduledAt, 'reschedule'));
  }

  return { updates, recoveryEpisodes };
}
