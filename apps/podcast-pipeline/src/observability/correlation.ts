import {
  type OpsCorrelation,
  opsCorrelationSchema,
} from '@zapengine/types/shared';

import { getPipelineSupabase } from '../services/supabase-client.js';

export function pipelineCorrelation(input: OpsCorrelation): OpsCorrelation {
  const fields = {
    ...input,
    gitSha: process.env['APP_COMMIT_SHA'],
    flyMachineId: process.env['FLY_MACHINE_ID'],
  };
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const parsed = opsCorrelationSchema.safeParse({ [key]: value });
    if (parsed.success && value) Object.assign(result, parsed.data);
  }
  return opsCorrelationSchema.parse(result);
}

export async function recordRenderCorrelation(
  recordId: string,
  correlation: OpsCorrelation,
): Promise<void> {
  if (!process.env['SUPABASE_URL'] || !process.env['SUPABASE_SERVICE_ROLE_KEY'])
    return;
  try {
    const { error } = await getPipelineSupabase()
      .rpc('ops_record_runtime', {
        p_service: '@zapengine/podcast-pipeline',
        p_source: 'render',
        p_record_id: recordId,
        p_correlation: correlation,
      })
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) throw new Error(error.message);
  } catch {
    // Observability failure must not change the queue outcome. Consumers see a gap.
    console.warn('[ops-correlation] Runtime identity could not be persisted.');
  }
}
