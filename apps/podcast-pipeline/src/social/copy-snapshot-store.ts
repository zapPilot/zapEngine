import { getPipelineSupabase } from '../services/supabase-client.js';
import { expectNoError, maybeOne } from '../services/supabase-rows.js';
import type { PackagingAssignment } from './packaging-experiments.js';
import type { SocialCopySnapshot } from './record.js';
import type { SocialLanguageCode, SocialPlatform } from './types.js';

interface DurableCopy {
  snapshot: SocialCopySnapshot;
  packagingByPlatform: Partial<Record<SocialPlatform, PackagingAssignment>>;
}

interface SnapshotRow {
  generated_copy: SocialCopySnapshot['generated'];
  published_copy: SocialCopySnapshot['published'];
  llm_model: string;
  packaging_by_platform: DurableCopy['packagingByPlatform'];
}

export async function loadSocialCopySnapshot(
  episodeId: string,
  languageCode: SocialLanguageCode,
): Promise<DurableCopy | null> {
  const row = await maybeOne(
    getPipelineSupabase()
      .from('social_copy_snapshots')
      .select('generated_copy,published_copy,llm_model,packaging_by_platform')
      .eq('episode_id', episodeId)
      .eq('language_code', languageCode)
      .maybeSingle<SnapshotRow>(),
  );
  return row
    ? {
        snapshot: {
          generated: row.generated_copy,
          published: row.published_copy,
          model: row.llm_model,
        },
        packagingByPlatform: row.packaging_by_platform,
      }
    : null;
}

export async function saveSocialCopySnapshot(
  episodeId: string,
  languageCode: SocialLanguageCode,
  copy: DurableCopy,
): Promise<DurableCopy> {
  // First committed copy wins, including if another process prepared it.
  await expectNoError(
    getPipelineSupabase().from('social_copy_snapshots').upsert(
      {
        episode_id: episodeId,
        language_code: languageCode,
        generated_copy: copy.snapshot.generated,
        published_copy: copy.snapshot.published,
        llm_model: copy.snapshot.model,
        packaging_by_platform: copy.packagingByPlatform,
      },
      { onConflict: 'episode_id,language_code', ignoreDuplicates: true },
    ),
  );
  const saved = await loadSocialCopySnapshot(episodeId, languageCode);
  if (!saved) throw new Error('Social copy snapshot missing after persistence');
  return saved;
}
