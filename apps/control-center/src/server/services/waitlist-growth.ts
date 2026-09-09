import type { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  unavailableWaitlist,
  type SocialWaitlistSummary,
} from '../../shared/waitlist-growth.js';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 500;
const JOB_BATCH_SIZE = 100;
type Client = SupabaseClient;
interface Signup {
  id: string;
  created_at: string;
  social_publish_job_id: string | null;
}
interface Job {
  id: string;
  episode_id: string;
  platform: string;
  language_code: string | null;
  social_post_id: string | null;
}

/** Read only acquisition metadata; email never enters the dashboard read model. */
export async function loadWaitlistGrowth(input: {
  create: typeof createClient;
  url: string;
  key: string;
  now: Date;
}): Promise<SocialWaitlistSummary> {
  try {
    const client = input.create(input.url, input.key, {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const until = input.now.toISOString();
    const since7d = new Date(input.now.getTime() - 7 * DAY_MS).toISOString();
    const since30d = new Date(input.now.getTime() - 30 * DAY_MS).toISOString();
    const [total, signups7d, signups30d] = await Promise.all(
      ([null, since7d, since30d] as const).map(async (since) => {
        let query = client
          .from('waitlist_signups')
          .select('id', { count: 'exact', head: true })
          .lte('created_at', until);
        if (since) {
          query = query.gte('created_at', since);
        }
        const result = await query;
        if (result.error) {
          throw result.error;
        }
        if (result.count === null || result.count === undefined) {
          throw new Error('Waitlist count unavailable');
        }
        return result.count;
      }),
    );
    if (
      total === undefined ||
      signups7d === undefined ||
      signups30d === undefined
    ) {
      throw new Error('Waitlist count unavailable');
    }
    const signups: Signup[] = [];
    while (signups.length < total) {
      const result = await client
        .from('waitlist_signups')
        .select('id,created_at,social_publish_job_id')
        .lte('created_at', until)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(signups.length, signups.length + PAGE_SIZE - 1);
      if (result.error) {
        throw result.error;
      }
      if (!result.data?.length) {
        throw new Error('Waitlist snapshot incomplete');
      }
      signups.push(...(result.data as Signup[]));
    }
    // Concurrent inserts/deletes must not turn a partial read into an exact summary.
    if (
      signups.length !== total ||
      new Set(signups.map((row) => row.id)).size !== total ||
      signups.filter((row) => Date.parse(row.created_at) >= Date.parse(since7d))
        .length !== signups7d ||
      signups.filter(
        (row) => Date.parse(row.created_at) >= Date.parse(since30d),
      ).length !== signups30d
    ) {
      throw new Error('Waitlist snapshot changed during collection');
    }
    const pipeline = client.schema('from_fed_to_chain');
    const ids = [
      ...new Set(
        signups.flatMap((row) =>
          row.social_publish_job_id ? [row.social_publish_job_id] : [],
        ),
      ),
    ];
    const jobs: Job[] = [];
    for (let offset = 0; offset < ids.length; offset += JOB_BATCH_SIZE) {
      const batch = ids.slice(offset, offset + JOB_BATCH_SIZE);
      let fetched = 0;
      while (true) {
        const result = await pipeline
          .from('social_publish_jobs')
          .select('id,episode_id,platform,language_code,social_post_id')
          .in('id', batch)
          .order('id', { ascending: true })
          .range(fetched, fetched + PAGE_SIZE - 1);
        if (result.error) {
          throw result.error;
        }
        if (!result.data?.length) {
          break;
        }
        jobs.push(...(result.data as Job[]));
        fetched += result.data.length;
      }
    }
    let message: string | null = null;
    const views = await readViews(client, jobs, until).catch(() => {
      message =
        '24h views unavailable; persisted signup counts remain available.';
      return new Map<string, number | null>();
    });
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    let attributedSocial7d = 0;
    const counts = new Map<string, number>();
    for (const signup of signups) {
      const job =
        signup.social_publish_job_id &&
        jobsById.get(signup.social_publish_job_id);
      if (!job) {
        continue;
      }
      counts.set(job.id, (counts.get(job.id) ?? 0) + 1);
      if (Date.parse(signup.created_at) >= Date.parse(since7d)) {
        attributedSocial7d += 1;
      }
    }
    return {
      status: 'ok',
      message,
      total,
      signups7d: signups7d,
      signups30d: signups30d,
      attributedSocial7d,
      directOrUnknown7d: signups7d - attributedSocial7d,
      conversions: jobs
        .filter((job) => counts.has(job.id))
        .map((job) => {
          const signups = counts.get(job.id)!;
          const views24h = job.social_post_id
            ? (views.get(job.social_post_id) ?? null)
            : null;
          return {
            socialPublishJobId: job.id,
            episodeId: job.episode_id,
            platform: job.platform,
            languageCode: job.language_code ?? 'unknown',
            socialPostId: job.social_post_id,
            signups,
            views24h,
            signupRate:
              views24h !== null && views24h > 0 ? signups / views24h : null,
          };
        })
        .sort(
          (a, b) =>
            b.signups - a.signups ||
            a.socialPublishJobId.localeCompare(b.socialPublishJobId),
        ),
    };
  } catch (error) {
    return unavailableWaitlist(
      error instanceof Error ? error.message : 'Waitlist telemetry unavailable',
    );
  }
}

async function readViews(
  client: Client,
  jobs: Job[],
  until: string,
): Promise<Map<string, number | null>> {
  const views = new Map<string, number | null>();
  const seenMetricIds = new Set<string>();
  const ids = [
    ...new Set(
      jobs.flatMap((job) => (job.social_post_id ? [job.social_post_id] : [])),
    ),
  ];
  for (let offset = 0; offset < ids.length; offset += JOB_BATCH_SIZE) {
    let fetched = 0;
    while (true) {
      const result = await client
        .schema('from_fed_to_chain')
        .from('social_post_metrics')
        .select('id,social_post_id,views,captured_at')
        .in('social_post_id', ids.slice(offset, offset + JOB_BATCH_SIZE))
        .eq('measurement_window', '24h')
        .eq('collection_status', 'collected')
        .lte('captured_at', until)
        .order('captured_at', { ascending: true })
        .order('id', { ascending: true })
        .range(fetched, fetched + PAGE_SIZE - 1);
      if (result.error) {
        throw result.error;
      }
      if (!result.data?.length) {
        break;
      }
      for (const row of result.data) {
        if (seenMetricIds.has(row.id)) {
          throw new Error('Metric snapshot changed during collection');
        }
        seenMetricIds.add(row.id);
        views.set(row.social_post_id, row.views);
      }
      fetched += result.data.length;
    }
  }
  return views;
}
