import { createHash } from 'node:crypto';

import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';

export interface SocialExperimentAssignment {
  experiment_key: string;
  episode_id: string;
  variant: string;
  assigned_at: string;
}

export function deterministicVariant(
  experimentKey: string,
  episodeId: string,
  variants: readonly [string, ...string[]] = ['en', 'ja'],
): string {
  const digest = createHash('sha256')
    .update(`${experimentKey}:${episodeId}`)
    .digest();
  return variants[digest.readUInt32BE(0) % variants.length]!;
}

export async function getOrCreateExperimentAssignment(input: {
  experimentKey: string;
  episodeId: string;
  variants?: readonly [string, ...string[]];
}): Promise<SocialExperimentAssignment> {
  const variant = deterministicVariant(
    input.experimentKey,
    input.episodeId,
    input.variants,
  );
  const supabase = getPipelineSupabase();
  const { error: insertError } = await supabase
    .from('social_experiment_assignments')
    .upsert(
      {
        experiment_key: input.experimentKey,
        episode_id: input.episodeId,
        variant,
      },
      { onConflict: 'experiment_key,episode_id', ignoreDuplicates: true },
    );
  if (insertError) throwSupabaseError(insertError);

  const { data, error } = await supabase
    .from('social_experiment_assignments')
    .select('experiment_key,episode_id,variant,assigned_at')
    .eq('experiment_key', input.experimentKey)
    .eq('episode_id', input.episodeId)
    .single<SocialExperimentAssignment>();
  if (error) throwSupabaseError(error);
  return data;
}
