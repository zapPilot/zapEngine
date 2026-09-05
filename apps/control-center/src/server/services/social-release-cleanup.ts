import type { ControlCenterConfig } from '../config/env.js';
import { createConfiguredServiceRoleClient } from './supabase.js';

const ACTIVE_STATUSES = ['queued', 'processing', 'failed'];
const JOB_LIMIT = 200;
const POST_LIMIT = 500;

export interface SocialReleaseEvidencePost {
  episodeId: string;
  platform: string;
  languageCode: string | null;
  postUrl: string | null;
  publishedAt: string;
}

export interface SocialReleaseEvidenceResponse {
  generatedAt: string;
  posts: SocialReleaseEvidencePost[];
  message: string | null;
}

export function createSocialReleaseCleanupService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  async function getEvidence(): Promise<SocialReleaseEvidenceResponse> {
    const client = createConfiguredServiceRoleClient(input.config);
    if (!client) {
      return {
        generatedAt: now().toISOString(),
        posts: [],
        message: 'Supabase social release evidence is not connected',
      };
    }

    const jobs = await client
      .from('social_publish_jobs')
      .select('episode_id')
      .in('status', ACTIVE_STATUSES)
      .limit(JOB_LIMIT);
    if (jobs.error) {
      throw jobs.error;
    }

    const episodeIds = [
      ...new Set(
        (jobs.data ?? []).flatMap((row) =>
          typeof row.episode_id === 'string' ? [row.episode_id] : [],
        ),
      ),
    ];
    if (episodeIds.length === 0) {
      return { generatedAt: now().toISOString(), posts: [], message: null };
    }

    const posts = await client
      .from('social_posts')
      .select('episode_id,platform,language_code,post_url,published_at')
      .in('episode_id', episodeIds)
      .order('published_at', { ascending: false })
      .limit(POST_LIMIT);
    if (posts.error) {
      throw posts.error;
    }

    return {
      generatedAt: now().toISOString(),
      posts: (posts.data ?? []).flatMap((row) => {
        if (
          typeof row.episode_id !== 'string' ||
          typeof row.platform !== 'string' ||
          typeof row.published_at !== 'string'
        ) {
          return [];
        }
        return [
          {
            episodeId: row.episode_id,
            platform: row.platform,
            languageCode:
              typeof row.language_code === 'string' ? row.language_code : null,
            postUrl: typeof row.post_url === 'string' ? row.post_url : null,
            publishedAt: row.published_at,
          },
        ];
      }),
      message: null,
    };
  }

  async function closeRelease(episodeId: string): Promise<{ skipped: number }> {
    const client = createConfiguredServiceRoleClient(input.config);
    if (!client) {
      throw new Error('Supabase social release cleanup is not connected');
    }
    const result = await client.rpc('close_social_release', {
      p_episode_id: episodeId,
    });
    if (result.error) {
      throw result.error;
    }
    return { skipped: typeof result.data === 'number' ? result.data : 0 };
  }

  return { getEvidence, closeRelease };
}
