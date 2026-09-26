import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Action, Episode, Store } from '../services/types.js';

const localization = z.object({
  episode_id: z.string(),
  title: z.string(),
  raw_text: z.string(),
  episodes: z.object({ source_url: z.string() }),
});
const eligible = [
  'scraped',
  'script_generated',
  'audio_generated',
  'completed',
];
function checked<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error)
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
    });
  return result.data;
}
function episodeRow(input: unknown): Episode {
  const row = localization.parse(input);
  return {
    id: row.episode_id,
    title: row.title,
    raw_text: row.raw_text,
    source_url: row.episodes.source_url,
  };
}

export function createStore(url: string, key: string): Store {
  const db = createClient(url, key, {
    db: { schema: 'from_fed_to_chain' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  function query() {
    return db
      .from('episode_localizations')
      .select('episode_id,title,raw_text,episodes!inner(source_url,created_at)')
      .eq('language_code', 'zh-Hant')
      .in('status', eligible)
      .not('raw_text', 'is', null)
      .neq('raw_text', '');
  }
  return {
    async discover(since, episode) {
      let q = query();
      q = episode
        ? q.eq('episode_id', episode)
        : q.gte('episodes.created_at', since);
      return (checked(await q) ?? []).map(episodeRow);
    },
    async episode(id) {
      const row = checked(await query().eq('episode_id', id).maybeSingle());
      if (!row)
        throw new Error(
          `No eligible zh-Hant localization for episode ${id}; pass episodes.id, not a localization id`,
        );
      return episodeRow(row);
    },
    async insert(episode, rule) {
      checked(
        await db
          .from('news_agent_actions')
          .upsert(
            { episode_id: episode, rule_version: rule },
            { onConflict: 'episode_id,rule_version', ignoreDuplicates: true },
          ),
      );
    },
    async list(statuses, rule, limit = 100, unnotified = false) {
      let q = db
        .from('news_agent_actions')
        .select('*')
        .in('status', statuses)
        .order('created_at', { ascending: unnotified })
        .limit(limit);
      if (rule) q = q.eq('rule_version', rule);
      if (unnotified) q = q.is('notified_at', null);
      return checked(await q) as Action[];
    },
    async cas(action, patch) {
      let q = db
        .from('news_agent_actions')
        .update(patch)
        .eq('id', action.id)
        .eq('status', action.status)
        .eq('updated_at', action.updated_at);
      q = action.claim_token
        ? q.eq('claim_token', action.claim_token)
        : q.is('claim_token', null);
      q = action.notified_at
        ? q.eq('notified_at', action.notified_at)
        : q.is('notified_at', null);
      return checked(await q.select('*').maybeSingle());
    },
    async notificationContext(episode) {
      const video = checked(
        await db
          .from('episode_videos')
          .select(
            'status,telegram_chat_id,episode_localizations!inner(language_code)',
          )
          .eq('episode_id', episode)
          .eq('episode_localizations.language_code', 'zh-Hant')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      const row = checked(
        await db
          .from('episodes')
          .select('source_url')
          .eq('id', episode)
          .single(),
      );
      const ingest = checked(
        await db
          .from('podcast_ingest_jobs')
          .select('telegram_chat_id')
          .eq(
            'source_url',
            z.object({ source_url: z.string() }).parse(row).source_url,
          )
          .eq('language_code', 'zh-Hant')
          .maybeSingle(),
      );
      const v = z
        .object({ status: z.string(), telegram_chat_id: z.string().nullable() })
        .nullable()
        .parse(video);
      const i = z
        .object({ telegram_chat_id: z.string() })
        .nullable()
        .parse(ingest);
      return {
        videoStatus: v?.status ?? null,
        videoChat: v?.telegram_chat_id ?? null,
        ingestChat: i?.telegram_chat_id ?? null,
      };
    },
  };
}
