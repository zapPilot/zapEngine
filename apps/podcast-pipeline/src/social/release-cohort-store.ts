import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import type { SocialPublishJobRow } from './daemon-store.js';
import {
  planPendingSocialReleaseCohorts,
  type ReleaseScheduleRow,
} from './release-cohort-plan.js';

export interface ReleaseCohortAlignmentResult {
  alignedLanes: number;
  rescheduledEpisodes: number;
  recoveryEpisodes: string[];
}

async function listReleaseScheduleRows(): Promise<ReleaseScheduleRow[]> {
  const { data, error } = await getPipelineSupabase()
    .from('social_publish_jobs')
    .select('id,episode_id,status,scheduled_at,next_attempt_at,completed_at')
    .in('status', ['queued', 'failed', 'processing', 'completed'])
    .order('scheduled_at', { ascending: true })
    .returns<ReleaseScheduleRow[]>();
  if (error) throwSupabaseError(error);
  return data ?? [];
}

/**
 * Applies the pure article-level repair plan with status CAS fences. A row that
 * changed state after planning is left for the next daemon tick instead of
 * being rewritten underneath a live claim.
 */
export async function alignPendingSocialReleaseCohorts(
  now: Date,
  graceMs: number,
): Promise<ReleaseCohortAlignmentResult> {
  const rows = await listReleaseScheduleRows();
  const plan = planPendingSocialReleaseCohorts(rows, now, graceMs);
  let alignedLanes = 0;
  const rescheduledEpisodes = new Set<string>();

  for (const update of plan.updates) {
    const { data, error } = await getPipelineSupabase()
      .from('social_publish_jobs')
      .update({
        scheduled_at: update.scheduledAt,
        next_attempt_at: update.nextAttemptAt,
        updated_at: now.toISOString(),
      })
      .eq('id', update.id)
      .eq('status', update.status)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (error) throwSupabaseError(error);
    if (!data) continue;
    alignedLanes += 1;
    if (update.reason === 'reschedule') {
      rescheduledEpisodes.add(update.episodeId);
    }
  }

  return {
    alignedLanes,
    rescheduledEpisodes: rescheduledEpisodes.size,
    recoveryEpisodes: plan.recoveryEpisodes,
  };
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
  const params = {
    p_owner: input.owner,
    p_now: input.now.toISOString(),
    ...(input.episodeId ? { p_episode_id: input.episodeId } : {}),
  };
  const response = await getPipelineSupabase().rpc(
    'claim_social_publish_batch',
    params,
  );
  if (response.error) throwSupabaseError(response.error);
  return response.data ? ([...response.data] as SocialPublishJobRow[]) : [];
}
