import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleLead,
  type InsertLead,
  type LeadRow,
  parseAllowedOrigins,
} from '../../../supabase/functions/genba-lead/handler.ts';

const SITE = 'https://i-xtsu-sixyou-ken-mei.github.io';
const DEV = 'http://localhost:5173';
const ENDPOINT = 'https://example-ref.supabase.co/functions/v1/genba-lead';

const insertLead = vi.fn<InsertLead>();

function deps(allowedOrigins: string[] = [SITE, DEV]) {
  return { allowedOrigins, insertLead };
}

function post(
  body: unknown,
  { origin = SITE as string | null, raw = false } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (origin) headers.set('Origin', origin);
  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: raw ? String(body) : JSON.stringify(body),
  });
}

function preflight(origin: string | null = SITE): Request {
  const headers = new Headers({
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  });
  if (origin) headers.set('Origin', origin);
  return new Request(ENDPOINT, { method: 'OPTIONS', headers });
}

const validLead = {
  email: 'user@example.com',
  interest: 'KOKODE Studio',
  organization: '現場病院',
  name: '山田',
  source: 'kokode-website',
  utm_source: 'x',
  utm_medium: '',
  utm_campaign: '',
  utm_term: '',
  utm_content: '',
  referrer: '',
  landing_url: 'https://i-xtsu-sixyou-ken-mei.github.io/kokode-ai/',
  page_url: 'https://i-xtsu-sixyou-ken-mei.github.io/kokode-ai/#contact',
};

async function expectError(
  response: Response,
  status: number,
  error: string,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

beforeEach(() => {
  insertLead.mockReset();
  insertLead.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseAllowedOrigins', () => {
  it('defaults to any origin when unset or blank', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(['*']);
    expect(parseAllowedOrigins(' , ')).toEqual(['*']);
  });

  it('splits, trims and drops trailing slashes', () => {
    expect(parseAllowedOrigins(` ${SITE}/ ,${DEV} `)).toEqual([SITE, DEV]);
  });
});

describe('origin allowlist', () => {
  it('rejects a POST from an unlisted origin without inserting', async () => {
    const res = await handleLead(
      post(validLead, { origin: 'https://evil.example' }),
      deps(),
    );

    await expectError(res, 403, 'origin_not_allowed');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(insertLead).not.toHaveBeenCalled();
  });

  it('rejects a preflight from an unlisted origin', async () => {
    const res = await handleLead(preflight('https://evil.example'), deps());

    await expectError(res, 403, 'origin_not_allowed');
  });

  it('accepts requests without an Origin header', async () => {
    const res = await handleLead(post(validLead, { origin: null }), deps());

    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('echoes any origin when the allowlist is a wildcard', async () => {
    const res = await handleLead(
      post(validLead, { origin: 'https://any.example' }),
      deps(['*']),
    );

    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://any.example',
    );
  });
});

describe('CORS preflight', () => {
  it('returns 204 with CORS headers for an allowed origin', async () => {
    const res = await handleLead(preflight(DEV), deps());

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(DEV);
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe(
      'content-type',
    );
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe(
      'POST, OPTIONS',
    );
    expect(insertLead).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  it('rejects non-POST methods', async () => {
    const res = await handleLead(
      new Request(ENDPOINT, { method: 'GET', headers: { Origin: SITE } }),
      deps(),
    );

    await expectError(res, 405, 'method_not_allowed');
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['a JSON string', '"hello"'],
  ])('rejects %s as invalid_json', async (_, body) => {
    const res = await handleLead(post(body, { raw: true }), deps());

    await expectError(res, 400, 'invalid_json');
    expect(insertLead).not.toHaveBeenCalled();
  });

  it('accepts a filled honeypot silently without inserting', async () => {
    const res = await handleLead(
      post({ ...validLead, website: 'http://spam.example' }),
      deps(),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(insertLead).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['without a domain', 'user@'],
    ['with spaces', 'us er@example.com'],
    ['longer than 254 chars', `${'a'.repeat(250)}@example.com`],
  ])('rejects an email %s', async (_, email) => {
    const res = await handleLead(post({ ...validLead, email }), deps());

    await expectError(res, 400, 'invalid_email');
    expect(insertLead).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['not a string', 42],
  ])('rejects an interest that is %s', async (_, interest) => {
    const res = await handleLead(post({ ...validLead, interest }), deps());

    await expectError(res, 400, 'invalid_interest');
    expect(insertLead).not.toHaveBeenCalled();
  });
});

describe('insert', () => {
  it('stores the whitelisted row and returns 201 with CORS', async () => {
    const res = await handleLead(post(validLead), deps());

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(insertLead).toHaveBeenCalledTimes(1);
    expect(insertLead).toHaveBeenCalledWith({
      email: 'user@example.com',
      name: '山田',
      organization: '現場病院',
      interest: 'KOKODE Studio',
      source: 'kokode-website',
      utm_source: 'x',
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      referrer: null,
      landing_url: 'https://i-xtsu-sixyou-ken-mei.github.io/kokode-ai/',
    } satisfies LeadRow);
  });

  it('trims, caps lengths and nulls empty optional fields', async () => {
    await handleLead(
      post({
        email: '  user@example.com  ',
        interest: ` ${'i'.repeat(200)} `,
        name: 'n'.repeat(300),
        organization: '   ',
        source: '',
        utm_source: 'u'.repeat(600),
        referrer: 123,
        page_url: 'https://example.com/should-not-be-stored',
        unexpected: 'ignored',
      }),
      deps(),
    );

    const row = insertLead.mock.calls[0][0];
    expect(row.email).toBe('user@example.com');
    expect(row.interest).toBe('i'.repeat(120));
    expect(row.name).toBe('n'.repeat(200));
    expect(row.organization).toBeNull();
    expect(row.source).toBe('kokode-website');
    expect(row.utm_source).toBe('u'.repeat(500));
    expect(row.referrer).toBeNull();
    expect(row).not.toHaveProperty('page_url');
    expect(row).not.toHaveProperty('unexpected');
  });

  it('returns 500 save_failed when the insert reports an error', async () => {
    insertLead.mockResolvedValue({ error: { message: 'permission denied' } });

    const res = await handleLead(post(validLead), deps());

    await expectError(res, 500, 'save_failed');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
  });

  it('returns 500 not_configured when the client cannot be built', async () => {
    insertLead.mockImplementation(() => {
      throw new Error('MissingDefaultSecretKeyError');
    });

    const res = await handleLead(post(validLead), deps());

    await expectError(res, 500, 'not_configured');
  });
});
