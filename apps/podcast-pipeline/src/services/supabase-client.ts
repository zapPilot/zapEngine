import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';

export type PipelineSupabaseClient = SupabaseClient<any, any, any>;

const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';

export function createPipelineSupabaseClient(): PipelineSupabaseClient {
  return createClient(
    getRequiredEnv('SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      db: {
        schema:
          process.env['SUPABASE_DB_SCHEMA']?.trim() ||
          DEFAULT_SUPABASE_DB_SCHEMA,
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
