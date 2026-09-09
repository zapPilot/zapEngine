import { SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';
import { readNullableString } from '../lib/string.js';
import { isRecord } from '../lib/typeGuards.js';
import { isTransientNetworkError } from '../lib/transient-network-error.js';

export type PipelineSupabaseClient = SupabaseClient<any, any, any>;

const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';
const SUPABASE_READ_MAX_ATTEMPTS = 3;
const SUPABASE_READ_RETRY_DELAY_MS = 250;
const RETRYABLE_SUPABASE_STATUS = new Set([408, 429]);
let pipelineSupabase: PipelineSupabaseClient | null = null;

type Fetcher = typeof globalThis.fetch;
type Sleep = (milliseconds: number) => Promise<void>;

class ReadRetrySupabaseClient extends SupabaseClient<any, any, any> {
  constructor() {
    super(
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
        global: {
          fetch: createRetryingSupabaseFetch(),
        },
      },
    );
    // The SDK otherwise retries our exhausted fetch, multiplying three
    // transport attempts into twelve. Schema clients inherit this setting.
    this.rest.retry = false;
  }
}

/**
 * Supabase/PostgREST reads are safe to repeat when the network drops before a
 * response arrives; mutations are not. Keep retry policy at the transport edge
 * so every SELECT benefits without teaching each DB helper to replay itself,
 * while POST/PATCH/DELETE still execute exactly once from this process.
 */
export function createRetryingSupabaseFetch(
  fetcher: Fetcher = globalThis.fetch,
  sleep: Sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Fetcher {
  return (async (input, init) => {
    if (!isIdempotentRead(input, init)) {
      return fetcher(input, init);
    }

    const signal =
      init?.signal !== undefined
        ? init.signal
        : input instanceof Request
          ? input.signal
          : undefined;

    let lastError: unknown;
    for (let attempt = 1; attempt <= SUPABASE_READ_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) signal?.throwIfAborted();
      try {
        const response = await fetcher(input, init);
        if (
          attempt === SUPABASE_READ_MAX_ATTEMPTS ||
          !isRetryableSupabaseStatus(response.status)
        ) {
          return response;
        }
        await response.body?.cancel().catch(() => {});
      } catch (error) {
        lastError = error;
        if (
          attempt === SUPABASE_READ_MAX_ATTEMPTS ||
          signal?.aborted ||
          isAbortError(error) ||
          !isTransientNetworkError(error)
        ) {
          throw error;
        }
      }

      await sleep(SUPABASE_READ_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Supabase read retry loop exhausted');
  }) as Fetcher;
}

function isIdempotentRead(
  input: Parameters<Fetcher>[0],
  init: Parameters<Fetcher>[1],
): boolean {
  const requestMethod =
    typeof Request !== 'undefined' && input instanceof Request
      ? input.method
      : undefined;
  const method = (init?.method ?? requestMethod ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

function isRetryableSupabaseStatus(status: number): boolean {
  return RETRYABLE_SUPABASE_STATUS.has(status) || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export function getPipelineSupabase(): PipelineSupabaseClient {
  pipelineSupabase ??= new ReadRetrySupabaseClient();
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

function formatSupabaseError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  const code = readNullableString(error['code']);
  const message =
    readNullableString(error['message']) ?? 'Supabase request failed';
  const details = readNullableString(error['details']);
  const hint = readNullableString(error['hint']);
  const parts = [code ? `[${code}] ${message}` : message];

  if (details) parts.push(`Details: ${details}`);
  if (hint) parts.push(`Hint: ${hint}`);

  return parts.join(' ');
}
