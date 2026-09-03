import { createClient } from '@supabase/supabase-js';

import type { ControlCenterConfig } from '../config/env.js';

/**
 * Service-role Supabase client used by control-center server services.
 *
 * The auth options are required: this runs server-side with no session store,
 * so token refresh and session persistence must stay off.
 */
export function createServiceRoleClient(
  url: string,
  key: string,
  schema = 'public',
) {
  return createClient(url, key, {
    db: { schema },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Null when the operator has not configured Supabase; services degrade to
 * an `unconfigured` read model instead of throwing at construction. */
export function createConfiguredServiceRoleClient(config: ControlCenterConfig) {
  return config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY
    ? createServiceRoleClient(
        config.SUPABASE_URL,
        config.SUPABASE_SERVICE_ROLE_KEY,
        config.SUPABASE_DB_SCHEMA,
      )
    : null;
}

export function postgrestErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Postgres `undefined_column`: a migration adding the column is not applied. */
export function isMissingColumnError(error: unknown): boolean {
  return postgrestErrorCode(error) === '42703';
}

/** PostgREST could not find the RPC (`PGRST202`) or Postgres has no such
 * function (`42883`): the migration defining it is not applied yet. */
export function isMissingRpcError(error: unknown): boolean {
  const code = postgrestErrorCode(error);
  return code === 'PGRST202' || code === '42883';
}
