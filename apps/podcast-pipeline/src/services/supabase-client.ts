import { SupabaseClient } from '@supabase/supabase-js';

import { getRequiredEnv } from '../lib/env.js';
import { readNullableString } from '../lib/string.js';
import { isTransientNetworkError } from '../lib/transient-network-error.js';
import { isRecord } from '../lib/typeGuards.js';

export type PipelineSupabaseClient = SupabaseClient<any, any, any>;

const DEFAULT_SUPABASE_DB_SCHEMA = 'from_fed_to_chain';
const SUPABASE_READ_MAX_ATTEMPTS = 3;
const SUPABASE_PRE_EXECUTION_MAX_ATTEMPTS = 5;
const SUPABASE_READ_RETRY_DELAY_MS = 250;
const RETRYABLE_SUPABASE_STATUS = new Set([408, 429]);

/**
 * PostgREST returns these before the statement reaches Postgres: the schema
 * cache is still loading (PGRST002) or the pool had no connection to hand out
 * (PGRST003). Nothing executed, so replaying the request — even a mutation — is
 * safe. They are the one server-side error worth a longer retry budget because
 * a cache reload outlasts the generic read window.
 */
const PRE_EXECUTION_RETRY_CODES = new Set(['PGRST002', 'PGRST003']);
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
 * response arrives; mutations are not, because the statement may already have
 * run. Keep retry policy at the transport edge so every SELECT benefits without
 * teaching each DB helper to replay itself, while POST/PATCH/DELETE still
 * execute exactly once from this process — except for the pre-execution
 * PostgREST failures, which never reached the database.
 */
export function createRetryingSupabaseFetch(
  fetcher: Fetcher = globalThis.fetch,
  sleep: Sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Fetcher {
  return async (input, init) => {
    const idempotentRead = isIdempotentRead(input, init);
    const signal = resolveAbortSignal(input, init);

    for (let attempt = 1; ; attempt += 1) {
      if (attempt > 1) signal?.throwIfAborted();

      let response: Response;
      try {
        response = await fetcher(input, init);
      } catch (error) {
        if (
          !idempotentRead ||
          attempt === SUPABASE_READ_MAX_ATTEMPTS ||
          signal?.aborted ||
          isAbortError(error) ||
          !isTransientNetworkError(error)
        ) {
          throw error;
        }
        await sleep(SUPABASE_READ_RETRY_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }

      const budget = await retryBudgetFor(response, idempotentRead);
      if (budget === null || attempt >= budget) {
        return response;
      }
      await response.body?.cancel().catch(() => {});
      await sleep(SUPABASE_READ_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  };
}

/**
 * How many transport attempts this response is worth, or `null` to return it
 * as-is. Reads keep the short generic budget; mutations only earn a retry when
 * the body names a pre-execution failure, which is the sole 5xx that cannot
 * have committed anything.
 */
async function retryBudgetFor(
  response: Response,
  idempotentRead: boolean,
): Promise<number | null> {
  if (!isRetryableSupabaseStatus(response.status)) {
    return null;
  }
  if (idempotentRead) {
    return SUPABASE_READ_MAX_ATTEMPTS;
  }
  const code = await readPostgrestErrorCode(response);
  return code !== null && PRE_EXECUTION_RETRY_CODES.has(code)
    ? SUPABASE_PRE_EXECUTION_MAX_ATTEMPTS
    : null;
}

async function readPostgrestErrorCode(
  response: Response,
): Promise<string | null> {
  const body = await response
    .clone()
    .text()
    .catch(() => '');
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) && typeof parsed['code'] === 'string'
      ? parsed['code']
      : null;
  } catch {
    return null;
  }
}

function resolveAbortSignal(
  input: Parameters<Fetcher>[0],
  init: Parameters<Fetcher>[1],
): AbortSignal | null | undefined {
  if (init?.signal !== undefined) {
    return init.signal;
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.signal;
  }
  return undefined;
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
