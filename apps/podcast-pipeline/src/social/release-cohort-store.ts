import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import type { SocialPublishJobRow } from './daemon-store.js';
import { SOCIAL_RELEASE_SLOTS } from './policy.js';
import { nextReleaseSlot } from './slot-policy.js';

const JST_OFFSET_MS = 9 * 60 * 60_000;

interface ReleaseScheduleRow {
  id: string;
  episode_id: string;
  status: SocialPublishJobRow['status'];
  scheduled_at: string;
  next_attempt_at: string;
  completed_at: string | null;
}

export interface ReleaseCohortAlignmentResult {
  alignedLanes: number;
  rescheduledEpisodes: number;
  recoveryEpisodes: string[];
}

async function listReleaseScheduleRows(): Promise<ReleaseScheduleRow[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select(
      'id,episode_id,status,scheduled_at,next_attempt_at,completed_at',
    )
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .order('scheduled_at', { ascending: true })
    .returns<ReleaseScheduleRow[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

function earliestSchedule(rows: readonly ReleaseScheduleRow[]): Date {
  return new Date(
    Math.min(...rows.map((row) => Date.parse(row.scheduled_at))),
  );
}

function isConfiguredArticleSlot(date: Date): boolean {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return SOCIAL_RELEASE_SLOTS.some(
    (slot) =>
      slot.hour === jst.getUTCHours() && slot.minute === jst.getUTCMinutes(),
  );
}

async function alignPendingRows(
  rows: readonly ReleaseScheduleRow[],
  scheduledAt: Date,
  now: Date,
): Promise<number> {
  let aligned = 0;
  const scheduledIso = scheduledAt.toISOString();
  for (const row of rows) {
    if (row.status !== 'queued' && row.status !== 'failed') continue;

    const nextAttemptAt =
      row.status === 'failed' &&
      Date.parse(row.next_attempt_at) > scheduledAt.getTime()
        ? row.next_attempt_at
        : scheduledIso;
    if (
      row.scheduled_at === scheduledIso &&
      row.next_attempt_at === nextAttemptAt
    ) {
      continue;
    }

    const { data, error } = await getPipelineSupabase()
      .from('social_publish_jobs')
      .update({
        scheduled_at: scheduledIso,
        next_attempt_at: nextAttemptAt,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)
      .eq('status', row.status)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) throwSupabaseError(error);
    if (data) aligned += 1;
  }
  return aligned;
}

/**
 * Repairs the production queue into the product contract before discovery.
 *
 * - A partially published episode is recovery state. Its remaining queued
 *   lanes are pulled back to the earliest sibling release time, while a failed
 *   lane keeps any later retry backoff.
 * - A completely unpublished episode is assigned exactly one article slot.
 *   Existing staggered per-platform timestamps are discarded and every movable
 *   lane is aligned to the same slot. Episodes are serialized at one per JST
 *   day by `nextReleaseSlot`.
 * - A correctly aligned article that is only slightly overdue is left at its
 *   original timestamp so the existing catch-up grace still works.
 * - `processing` rows are never mutated; the claim lease remains authoritative.
 */
export async function alignPendingSocialReleaseCohorts(
  now: Date,
  graceMs: number,
): Promise<ReleaseCohortAlignmentResult> {
  const rows = await listReleaseScheduleRows();
  if (rows.length === 0) {
    return { alignedLanes: 0, rescheduledEpisodes: 0, recoveryEpisodes: [] };
  }

  const byEpisode = new Map<string, ReleaseScheduleRow[]>();
  for (const row of rows) {
    const group = byEpisode.get(row.episode_id) ?? [];
    group.push(row);
    byEpisode.set(row.episode_id, group);
  }

  let alignedLanes = 0;
  let rescheduledEpisodes = 0;
  const recoveryEpisodes: string[] = [];
  const unpublished: Array<{
    episodeId: string;
    rows: ReleaseScheduleRow[];
    earliest: Date;
  }> = [];

  for (const [episodeId, group] of byEpisode) {
    const hasCompleted = group.some((row) => row.status === 'completed');
    const hasPending = group.some((row) => row.status !== 'completed');
    if (!hasPending) continue;

    if (hasCompleted) {
      recoveryEpisodes.push(episodeId);
      alignedLanes += await alignPendingRows(
        group,
        earliestSchedule(group),
        now,
      );
      continue;
    }

    unpublished.push({ episodeId, rows: group, earliest: earliestSchedule(group) });
  }

  unpublished.sort(
    (left, right) => left.earliest.getTime() - right.earliest.getTime(),
  );
  const scheduledArticles: Date[] = [];
  for (const cohort of unpublished) {
    const uniqueTimes = new Set(cohort.rows.map((row) => row.scheduled_at));
    const alreadyAligned = uniqueTimes.size === 1;
    const stillWithinGrace =
      cohort.earliest.getTime() >= now.getTime() - graceMs;
    if (
      alreadyAligned &&
      stillWithinGrace &&
      isConfiguredArticleSlot(cohort.earliest)
    ) {
      scheduledArticles.push(cohort.earliest);
      continue;
    }

    // Never bring an article forward relative to the time its existing queue
    // first considered it ready. Once an old slot is actually missed, repair
    // from `now` instead of fake-completing or burst-publishing it.
    const after = new Date(
      Math.max(cohort.earliest.getTime(), now.getTime()),
    );
    const scheduledAt = nextReleaseSlot({
      after,
      scheduled: scheduledArticles,
      // Queue repair must be able to serialize a backlog longer than discovery's
      // normal look-ahead horizon.
      horizonDays: 366,
    });
    if (!scheduledAt) continue;
    scheduledArticles.push(scheduledAt);

    const moved = await alignPendingRows(cohort.rows, scheduledAt, now);
    alignedLanes += moved;
    if (moved > 0) rescheduledEpisodes += 1;
  }

  return { alignedLanes, rescheduledEpisodes, recoveryEpisodes };
}

/** A completed lane plus any unfinished sibling makes an exceptional recovery cohort. */
export async function listPartiallyPublishedCohorts(): Promise<string[]> {
  const rows = await listReleaseScheduleRows();
  const byEpisode = new Map<string, Set<SocialPublishJobRow['status']>>();
  for (const row of rows) {
    const statuses = byEpisode.get(row.episode_id) ?? new Set();
    statuses.add(row.status);
    byEpisode.set(row.episode_id, statuses);
  }
  return [...byEpisode.entries()].flatMap(([episodeId, statuses]) =>
    statuses.has('completed') &&
    [...statuses].some((status) => status !== 'completed')
      ? [episodeId]
      : [],
  );
}

/**
 * Same lease semantics as the normal claim RPC, optionally fenced to one
 * episode while recovering a partial release.
 */
export async function claimReleaseCohortJobs(input: {
  owner: string;
  now: Date;
  episodeId?: string;
}): Promise<SocialPublishJobRow[]> {
  const { data, error } = await getPipelineSupabase().rpc(
    'claim_social_publish_batch',
    {
      p_owner: input.owner,
      p_now: input.now.toISOString(),
      ...(input.episodeId ? { p_episode_id: input.episodeId } : {}),
    },
  );
  if (error) throwSupabaseError(error);
  return (data ?? []) as SocialPublishJobRow[];
}
