import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import {
  MAX_PUBLISH_ATTEMPTS,
  type SocialPublishJobRow,
} from './daemon-store.js';
import {
  planPendingSocialReleaseCohorts,
  type ReleaseScheduleRow,
} from './release-cohort-plan.js';

/** The plan's input plus the one column only the claim fence cares about. */
interface ReleaseQueueRow extends ReleaseScheduleRow {
  attempt_count: number;
}

export interface ReleaseCohortAlignmentResult {
  alignedLanes: number;
  rescheduledEpisodes: number;
  recoveryEpisodes: string[];
}

const RELEASE_QUEUE_PAGE_SIZE = 1000;

/**
 * Reads the whole durable queue. It is paged because PostgREST truncates a
 * response at its default page size without an error, and a plan built from a
 * truncated queue would silently double-book article slots. Paging is keyed on
 * `id` rather than `scheduled_at`, because a cohort's lanes deliberately share
 * one `scheduled_at` and rows would shift between pages; the article ordering
 * the plan and the recovery fence rely on is restored in memory.
 */
async function listReleaseScheduleRows(): Promise<ReleaseQueueRow[]> {
  const rows: ReleaseQueueRow[] = [];
  for (let offset = 0; ; offset += RELEASE_QUEUE_PAGE_SIZE) {
    const { data, error } = await getPipelineSupabase()
      .from('social_publish_jobs')
      .select(
        'id,episode_id,status,scheduled_at,next_attempt_at,completed_at,attempt_count',
      )
      .in('status', ['queued', 'failed', 'processing', 'completed'])
      .order('id', { ascending: true })
      .range(offset, offset + RELEASE_QUEUE_PAGE_SIZE - 1)
      .returns<ReleaseQueueRow[]>();
    if (error) throwSupabaseError(error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < RELEASE_QUEUE_PAGE_SIZE) break;
  }
  return rows.sort(
    (left, right) =>
      Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at),
  );
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

/**
 * A completed lane plus a sibling that can still be claimed makes an
 * exceptional recovery cohort. A lane that has burned every attempt is dead,
 * not unfinished: `claim_social_publish_batch` can never return it again, so
 * fencing the queue on its article would stop every other article forever
 * instead of for one retry backoff. Such an article is reported as blocked by
 * the queue summary rather than held here.
 */
export async function listPartiallyPublishedCohorts(): Promise<string[]> {
  const rows = await listReleaseScheduleRows();
  const byEpisode = new Map<string, { published: boolean; claimable: boolean }>(
    [],
  );
  for (const row of rows) {
    const cohort = byEpisode.get(row.episode_id) ?? {
      published: false,
      claimable: false,
    };
    if (row.status === 'completed') cohort.published = true;
    else if (row.attempt_count < MAX_PUBLISH_ATTEMPTS) cohort.claimable = true;
    byEpisode.set(row.episode_id, cohort);
  }
  return [...byEpisode.entries()].flatMap(([episodeId, cohort]) =>
    cohort.published && cohort.claimable ? [episodeId] : [],
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
