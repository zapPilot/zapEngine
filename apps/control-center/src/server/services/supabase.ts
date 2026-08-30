import { createClient } from '@supabase/supabase-js';

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
