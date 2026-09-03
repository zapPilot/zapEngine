import type {
  PodcastVideoReviewIssue,
  PodcastVideoReviewStatus,
  PodcastVideoReviewVerdict,
} from '@zapengine/types/shared';

import { getPipelineSupabase, throwSupabaseError } from '../../supabase-client.js';

export interface ReviewExportRow {
  id: string;
  episodeId: string;
  title: string | null;
  visualHash: string | null;
  languageCode: string | null;
  sceneId: string | null;
  reviewer: 'operator' | 'agent';
  verdict: PodcastVideoReviewVerdict;
  issueCategories: PodcastVideoReviewIssue[];
  note: string | null;
  pipelineContext: Record<string, unknown>;
  status: PodcastVideoReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export async function listReviewsForExport(input: {
  status: 'open' | 'triaged' | 'all';
  episodeId?: string;
  limit: number;
}): Promise<ReviewExportRow[]> {
  const supabase = getPipelineSupabase();
  let query = supabase
    .from('episode_video_reviews')
    .select(
      'id,episode_id,visual_hash,language_code,scene_id,reviewer,verdict,issue_categories,note,pipeline_context,status,created_at,updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit);
  if (input.status !== 'all') query = query.eq('status', input.status);
  if (input.episodeId) query = query.eq('episode_id', input.episodeId);
  const { data, error } = await query;
  if (error) throwSupabaseError(error);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const episodeIds = [
    ...new Set(rows.flatMap((row) => (typeof row['episode_id'] === 'string' ? [row['episode_id']] : []))),
  ];
  const titleByEpisode = new Map<string, string | null>();
  if (episodeIds.length > 0) {
    const episodes = await supabase
      .from('episodes')
      .select('id,source_title')
      .in('id', episodeIds);
    if (episodes.error) throwSupabaseError(episodes.error);
    for (const episode of (episodes.data ?? []) as { id: string; source_title: string | null }[]) {
      titleByEpisode.set(episode.id, episode.source_title);
    }
  }

  return rows.flatMap((row) => {
    const id = stringValue(row['id']);
    const episodeId = stringValue(row['episode_id']);
    const verdict = stringValue(row['verdict']) as PodcastVideoReviewVerdict | null;
    const status = stringValue(row['status']) as PodcastVideoReviewStatus | null;
    if (!id || !episodeId || !verdict || !status) return [];
    return [{
      id,
      episodeId,
      title: titleByEpisode.get(episodeId) ?? null,
      visualHash: nullableString(row['visual_hash']),
      languageCode: nullableString(row['language_code']),
      sceneId: nullableString(row['scene_id']),
      reviewer: row['reviewer'] === 'agent' ? 'agent' : 'operator',
      verdict,
      issueCategories: Array.isArray(row['issue_categories'])
        ? row['issue_categories'].filter((value): value is PodcastVideoReviewIssue => typeof value === 'string')
        : [],
      note: nullableString(row['note']),
      pipelineContext:
        row['pipeline_context'] && typeof row['pipeline_context'] === 'object' && !Array.isArray(row['pipeline_context'])
          ? (row['pipeline_context'] as Record<string, unknown>)
          : {},
      status,
      createdAt: stringValue(row['created_at']) ?? '',
      updatedAt: stringValue(row['updated_at']) ?? '',
    }];
  });
}

export async function resolveReview(input: {
  id: string;
  status: 'triaged' | 'resolved';
  note?: string | null;
}): Promise<boolean> {
  const { data, error } = await getPipelineSupabase().rpc(
    'resolve_episode_video_review',
    {
      p_review_id: input.id,
      p_status: input.status,
      p_resolution_note: input.note ?? null,
      p_resolved_by: 'agent',
    },
  );
  if (error) throwSupabaseError(error);
  return data === true;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableString(value: unknown): string | null {
  return value == null ? null : stringValue(value);
}
