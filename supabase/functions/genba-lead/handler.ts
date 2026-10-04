// Pure request handler for `genba-lead` -- no Deno / npm imports, so the
// same code runs in the Edge runtime (index.ts) and under vitest on Node.

/** Row inserted into `kokode_ai.leads`; every other column is DB-defaulted. */
export interface LeadRow {
  email: string;
  name: string | null;
  organization: string | null;
  interest: string;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_url: string | null;
}

export type InsertLead = (
  row: LeadRow,
) => PromiseLike<{ error: { message: string } | null }>;

export interface HandlerDeps {
  /** Exact origins allowed to call the function; `["*"]` allows any. */
  allowedOrigins: string[];
  /** May throw (e.g. no secret key in the env) -- reported as not_configured. */
  insertLead: InsertLead;
}

const MAX_LEN = 500;
const MAX_EMAIL_LEN = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HONEYPOT_FIELDS = ['website', 'company_website', 'nickname', '_gotcha'];
const DEFAULT_SOURCE = 'kokode-website';

export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length > 0 ? origins : ['*'];
}

function isAllowed(origin: string, allowed: string[]): boolean {
  return allowed.includes('*') || allowed.includes(origin);
}

function json(
  status: number,
  body: unknown,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function str(value: unknown, limit = MAX_LEN): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

function optional(value: unknown, limit = MAX_LEN): string | null {
  return str(value, limit) || null;
}

export async function handleLead(
  req: Request,
  deps: HandlerDeps,
): Promise<Response> {
  const origin = req.headers.get('origin');

  // The allowlist blocks cross-site form spam from browsers (which always
  // send Origin); it is not authentication -- non-browser clients can omit
  // or forge the header.
  if (origin && !isAllowed(origin, deps.allowedOrigins)) {
    return json(403, { error: 'origin_not_allowed' }, { Vary: 'Origin' });
  }

  const cors: Record<string, string> = origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' }, cors);
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' }, cors);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return json(400, { error: 'invalid_json' }, cors);
  }
  const body = parsed as Record<string, unknown>;

  // Cheap bot trap: answer like a success so bots don't adapt, store nothing.
  if (HONEYPOT_FIELDS.some((field) => str(body[field]) !== '')) {
    return json(201, { ok: true }, cors);
  }

  // Emails are rejected, not truncated: a cut-off address is a wrong one.
  const email = typeof body['email'] === 'string' ? body['email'].trim() : '';
  if (email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json(400, { error: 'invalid_email' }, cors);
  }
  const interest = str(body['interest'], 120);
  if (!interest) {
    return json(400, { error: 'invalid_interest' }, cors);
  }

  const row: LeadRow = {
    email,
    name: optional(body['name'], 200),
    organization: optional(body['organization'], 200),
    interest,
    source: str(body['source'], 100) || DEFAULT_SOURCE,
    utm_source: optional(body['utm_source']),
    utm_medium: optional(body['utm_medium']),
    utm_campaign: optional(body['utm_campaign']),
    utm_term: optional(body['utm_term']),
    utm_content: optional(body['utm_content']),
    referrer: optional(body['referrer']),
    landing_url: optional(body['landing_url']),
  };

  let result: Awaited<ReturnType<InsertLead>>;
  try {
    result = await deps.insertLead(row);
  } catch (error) {
    console.error('kokode lead endpoint: client unavailable', error);
    return json(500, { error: 'not_configured' }, cors);
  }
  if (result.error) {
    console.error('kokode lead endpoint: insert failed', result.error.message);
    return json(500, { error: 'save_failed' }, cors);
  }

  // Future hooks: Turnstile verify, rate limit, email notification, auto-reply.
  return json(201, { ok: true }, cors);
}
