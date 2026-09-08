import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import {
  listSocialEpisodeLocalizationTitles,
  type SocialPublishJobRow,
} from './daemon-store.js';
import { getPublishedPlatform, readPublishState } from './state.js';

type LocalHistoryRow = Pick<
  SocialPublishJobRow,
  'episode_id' | 'platform' | 'language_code' | 'completed_at'
>;

// Lanes of one article complete days apart, so a purely chronological listing
// interleaves articles and leaves a lane sitting under the previous article's
// title. Group by episode, ordered by each article's most recent lane.
function groupByEpisode(
  rows: readonly LocalHistoryRow[],
): [string, LocalHistoryRow[]][] {
  const byEpisode = new Map<string, LocalHistoryRow[]>();
  for (const row of rows) {
    const lanes = byEpisode.get(row.episode_id) ?? [];
    lanes.push(row);
    byEpisode.set(row.episode_id, lanes);
  }
  return [...byEpisode];
}

// Completed local-only jobs do not appear in the pending queue or social_posts.
// Report their evidence separately so absence from the queue is not mistaken for
// an article that was never scheduled. Missing telemetry remains explicitly unknown.
export async function reportLocalPublicationHistory(
  log = console.log,
): Promise<void> {
  try {
    const { data, error } = await getPipelineSupabase()
      .from('social_publish_jobs')
      .select('episode_id,platform,language_code,completed_at')
      .eq('status', 'completed')
      .is('social_post_id', null)
      .order('completed_at', { ascending: false })
      .limit(100)
      .returns<LocalHistoryRow[]>();
    if (error) throwSupabaseError(error);
    if (!data?.length) return;
    const state = await readPublishState();
    const titles = await listSocialEpisodeLocalizationTitles([
      ...new Set(data.map((row) => row.episode_id)),
    ]);
    for (const [episodeId, lanes] of groupByEpisode(data)) {
      const title =
        titles.find(
          (item) =>
            item.episode_id === episodeId && item.language_code === 'zh-Hant',
        )?.title ?? episodeId;
      log(
        `📜 [social-daemon] history · “${title}” · completed · historical telemetry unavailable`,
      );
      for (const row of lanes) {
        const local = getPublishedPlatform(
          state,
          row.episode_id,
          row.platform,
          row.language_code,
        );
        const matches =
          local?.published === true &&
          row.completed_at &&
          Date.parse(local.publishedAt) === Date.parse(row.completed_at);
        const url = matches ? local.url : undefined;
        log(
          `📜 [social-daemon]   ${row.platform}/${row.language_code} · ${row.completed_at ?? 'time unknown'} · local publication record${url ? ` · ${url}` : ' · no verified link'}`,
        );
      }
    }
  } catch (error) {
    log(
      `⚠️ [social-daemon] publication history unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
