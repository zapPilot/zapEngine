import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';
import { isRecord } from '../lib/typeGuards.js';

export type PipelineSupabaseClient = SupabaseClient<any, any, any>;

const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';
let pipelineSupabase: PipelineSupabaseClient | null = null;

function createPipelineSupabaseClient(): PipelineSupabaseClient {
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

export function getPipelineSupabase(): PipelineSupabaseClient {
  pipelineSupabase ??= createPipelineSupabaseClient();
  return pipelineSupabase;
}

export function throwSupabaseError(error: unknown): never {
  if (error instanceof Error) {
    throw error;
  }

  const normalized = new Error(formatSupabaseError(error), { cause: error });
  (normalized as { supabaseError?: unknown }).supabaseError = error;
  throw normalized;
}

/**
 * Fly deploys `main` automatically while Supabase migrations are applied by hand
 * afterwards, so code routinely reaches production before the RPC it calls
 * exists. Separate that one rollout condition from a real failure: PostgREST
 * answers `PGRST202` and Postgres `42883` for an unknown function, and
 * PostgREST's message names the function it could not resolve.
 */
export function isMissingSupabaseRpc(error: unknown, rpcName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const code = error['code'];
  if (code === 'PGRST202' || code === '42883') {
    return true;
  }
  const message = error['message'];
  return (
    typeof message === 'string' &&
    message.includes(rpcName) &&
    message.includes('schema cache')
  );
}

function formatSupabaseError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  const code = readOptionalString(error['code']);
  const message =
    readOptionalString(error['message']) ?? 'Supabase request failed';
  const details = readOptionalString(error['details']);
  const hint = readOptionalString(error['hint']);
  const parts = [code ? `[${code}] ${message}` : message];

  if (details) parts.push(`Details: ${details}`);
  if (hint) parts.push(`Hint: ${hint}`);

  return parts.join(' ');
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
