import {
  getPipelineSupabase as getSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import type {
  DistributionEpisodeRow,
  DistributionLocalizationRow,
  DistributionMetricRow,
  DistributionPostRow,
  DistributionPublishJobRow,
  DistributionSnapshotSource,
  DistributionStrategyVersionRow,
  DistributionVideoRow,
} from './distribution-snapshot.js';

/**
 * Reads the whole corpus for the distribution snapshot.
 *
 * Every other reader in this codebase is windowed, because every other reader
 * answers "what happened lately". This one publishes a lifetime total, so it
 * cannot be. PostgREST caps a response at 1000 rows and answers a
 * past-the-end range with an empty page rather than an error, so each table is
 * walked in pages until one comes back short — a silent truncation here would
 * show up as a public page quietly under-reporting after the corpus outgrew
 * one page.
 */

const PAGE_SIZE = 1_000;

/** Column lists are explicit so a widening table does not widen the download. */
const EPISODE_COLUMNS = 'id,source_title,source_url,created_at';
const LOCALIZATION_COLUMNS =
  'episode_id,language_code,hls_url,classroom_hls_url';
const VIDEO_COLUMNS = 'episode_id,status';
const POST_COLUMNS =
  'id,episode_id,platform,language_code,post_url,published_at';
const METRIC_COLUMNS =
  'social_post_id,captured_at,collection_status,views,impressions,likes,comments,shares';
const PUBLISH_JOB_COLUMNS = 'status';
const STRATEGY_VERSION_COLUMNS = 'platform,language_code';

export async function loadDistributionSnapshotSource(): Promise<DistributionSnapshotSource> {
  const [
    episodes,
    localizations,
    videos,
    posts,
    metrics,
    publishJobs,
    strategyVersions,
  ] = await Promise.all([
    readAll<DistributionEpisodeRow>('episodes', EPISODE_COLUMNS, 'id'),
    readAll<DistributionLocalizationRow>(
      'episode_localizations',
      LOCALIZATION_COLUMNS,
      'id',
    ),
    readAll<DistributionVideoRow>(
      'episode_videos',
      VIDEO_COLUMNS,
      'episode_localization_id',
    ),
    readAll<DistributionPostRow>('social_posts', POST_COLUMNS, 'id'),
    readAll<DistributionMetricRow>('social_post_metrics', METRIC_COLUMNS, 'id'),
    readAll<DistributionPublishJobRow>(
      'social_publish_jobs',
      PUBLISH_JOB_COLUMNS,
      'id',
    ),
    readAll<DistributionStrategyVersionRow>(
      'social_strategy_versions',
      STRATEGY_VERSION_COLUMNS,
      'id',
    ),
  ]);

  return {
    episodes,
    localizations,
    videos,
    posts,
    metrics,
    publishJobs,
    strategyVersions,
  };
}

/**
 * Pages through one table. `orderColumn` must be unique: paging by a
 * non-unique ordering lets rows shift between pages, which would drop or
 * double-count them.
 */
async function readAll<T>(
  table: string,
  columns: string,
  orderColumn: string,
): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await getSupabase()
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .returns<T[]>();

    if (error) {
      throwSupabaseError(error);
    }

    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
