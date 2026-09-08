import { hostname } from 'node:os';

import {
  getPipelineSupabase,
  throwSupabaseError,
} from '../services/supabase-client.js';
import { isProcessAliveDefault } from './daemon-lock.js';

// Call only after acquiring the machine-wide daemon lock. Keep rows processing
// so missed-slot alignment cannot reschedule an interrupted release.
export async function recoverOrphanedSocialLeases(
  options: {
    now?: Date;
    host?: string;
    isProcessAlive?: (pid: number) => boolean;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const now = (options.now ?? new Date()).toISOString();
  const prefix = `${options.host ?? hostname()}:`;
  const isAlive = options.isProcessAlive ?? isProcessAliveDefault;
  const db = getPipelineSupabase();
  const { data, error } = await db
    .from('social_publish_jobs')
    .select('lease_owner')
    .eq('status', 'processing')
    .gt('lease_expires_at', now)
    .returns<{ lease_owner: string | null }[]>();
  if (error) throwSupabaseError(error);

  for (const owner of new Set((data ?? []).map((row) => row.lease_owner))) {
    if (!owner?.startsWith(prefix)) continue;
    const pidText = owner.slice(prefix.length);
    if (!/^[1-9]\d*$/.test(pidText)) continue;
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || isAlive(pid)) continue;
    const result = await db
      .from('social_publish_jobs')
      .update({ lease_expires_at: now, updated_at: now })
      .eq('status', 'processing')
      .eq('lease_owner', owner)
      .gt('lease_expires_at', now)
      .select('id');
    if (result.error) throwSupabaseError(result.error);
    if (result.data?.length) {
      (options.log ?? console.log)(
        `🔓 [social-daemon] recovered ${result.data.length} orphaned leases from ${owner}`,
      );
    }
  }
}
