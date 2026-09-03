import {
  getPipelineSupabase,
  throwSupabaseError,
} from './supabase-client.js';

/**
 * Persist an operator-only visual-search checkpoint before remote image search
 * begins. The final completion RPC overwrites visual_payload with the canonical
 * completed payload; enqueue/retry already clears visual_payload. Keeping this
 * transient payload in the existing column makes failed attempts debuggable
 * without adding another lifecycle column or changing the completed-visual
 * contract.
 */
export async function saveEpisodeVideoVisualDebug(
  episodeId: string,
  leaseOwner: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const supabase = getPipelineSupabase();
  const { data, error } = await supabase
    .from('episode_video_visuals')
    .update({
      visual_payload: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('episode_id', episodeId)
    .eq('status', 'processing')
    .eq('lease_owner', leaseOwner)
    .select('episode_id')
    .maybeSingle<{ episode_id: string }>();
  if (error) throwSupabaseError(error);
  return Boolean(data);
}
