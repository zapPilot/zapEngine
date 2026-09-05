// Socket / DNS layer failures are worth another tick; anything that says the
// request itself was wrong (PostgREST/Postgres error codes) is not.
//
// postgrest-js wraps the network failure as a PostgREST error object
// `{ message, details, hint, code: '' }` and `throwSupabaseError` rethrows it
// as `new Error(formatted, { cause: plainObject })`. The underlying token may
// therefore sit in `error.message`, `error.details`, `error.code`, or
// `error.cause` chain, so we walk up to 5 layers.

const TRANSIENT_CODE_SET = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const TRANSIENT_TOKEN_RE =
  /(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|EAI_AGAIN|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ENETDOWN|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|UND_ERR_SOCKET|fetch failed|socket hang up)/i;

interface ErrorShape {
  cause?: unknown;
  supabaseError?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

function errorShapeFromValue(value: unknown): ErrorShape | null {
  if (!value || typeof value !== 'object') return null;
  return value;
}

function hasTransientToken(candidate: ErrorShape): boolean {
  if (
    typeof candidate.code === 'string' &&
    TRANSIENT_CODE_SET.has(candidate.code)
  ) {
    return true;
  }
  const messageMatch =
    typeof candidate.message === 'string' &&
    TRANSIENT_TOKEN_RE.test(candidate.message);
  if (messageMatch) return true;
  const detailsMatch =
    typeof candidate.details === 'string' &&
    TRANSIENT_TOKEN_RE.test(candidate.details);
  if (detailsMatch) return true;
  return false;
}

export function isTransientNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const shape = errorShapeFromValue(current);
    if (!shape) break;
    if (hasTransientToken(shape)) return true;
    // `throwSupabaseError` stashes the plain PostgREST object on `supabaseError`
    // in addition to `cause`, so check that branch as well.
    if (shape.supabaseError) {
      const supabaseShape = errorShapeFromValue(shape.supabaseError);
      if (supabaseShape && hasTransientToken(supabaseShape)) return true;
    }
    if (shape.cause === undefined || shape.cause === null) break;
    // Avoid infinite loop on self-referential cause.
    if (shape.cause === current) break;
    current = shape.cause;
  }
  return false;
}
