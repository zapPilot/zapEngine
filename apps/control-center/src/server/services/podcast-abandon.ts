import type { ControlCenterConfig } from '../config/env.js';
import { createConfiguredServiceRoleClient } from './supabase.js';

export const CONTROL_CENTER_ABANDON_REASON =
  'Dismissed from Control Center by operator';

export function createPodcastAbandonService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
}) {
  const client = createConfiguredServiceRoleClient(input.config);
  const now = input.now ?? (() => new Date());

  return {
    async abandonVideo(episodeId: string): Promise<void> {
      if (!client) {
        throw new Error('Supabase podcast pipeline is not connected');
      }

      const { data, error } = await client
        .from('episode_video_visuals')
        .update({
          abandoned_at: now().toISOString(),
          abandoned_reason: CONTROL_CENTER_ABANDON_REASON,
        })
        .eq('episode_id', episodeId)
        .is('abandoned_at', null)
        .select('episode_id');

      if (error) {
        throw error;
      }
      if ((data ?? []).length > 0) {
        return;
      }

      // Make the endpoint idempotent for a repeated click or a race with the
      // 7-second queue poll. A genuinely unknown episode is still surfaced as
      // an operator conflict instead of pretending the dismissal succeeded.
      const current = await client
        .from('episode_video_visuals')
        .select('episode_id,abandoned_at')
        .eq('episode_id', episodeId)
        .limit(1);
      if (current.error) {
        throw current.error;
      }
      const row = current.data?.[0] as
        | { episode_id: string; abandoned_at: string | null }
        | undefined;
      if (row?.abandoned_at) {
        return;
      }

      throw {
        code: '22023',
        message: 'Episode has no video visual job to abandon',
      };
    },
  };
}
