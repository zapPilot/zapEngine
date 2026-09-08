import { Hono } from 'hono';
import { z } from 'zod';

import { HttpStatus, RateLimitException } from '../common/http';
import type { DatabaseService } from '../database/database.service';
import { jsonResponse, jsonValidator } from './shared';
import { zEmail } from './validators';

const WAITLIST_RATE_LIMIT = 10;
const WAITLIST_RATE_WINDOW_MS = 10 * 60 * 1000;
const SOCIAL_PLATFORMS = new Set(['x', 'threads', 'rednote', 'youtube']);
const SOCIAL_LANGUAGES = new Set(['zh-Hant', 'ja', 'en']);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DatabaseError {
  message: string;
}

interface SocialPublishJobRow {
  id: string;
}

interface TableQuery {
  select(columns: string): TableQuery;
  eq(column: string, value: string): TableQuery;
  maybeSingle(): Promise<{
    data: SocialPublishJobRow | null;
    error: DatabaseError | null;
  }>;
  upsert(
    values: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ): Promise<{ error: DatabaseError | null }>;
}

interface WaitlistDatabaseClient {
  from(table: string): TableQuery;
  schema(schema: string): { from(table: string): TableQuery };
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const waitlistSignupSchema = z.object({
  email: zEmail('Please enter a valid email address')
    .max(320)
    .transform((value) => value.trim().toLowerCase()),
  ctaLocation: optionalText(64),
  landingPath: optionalText(512),
  referrer: optionalText(1024),
  utmSource: optionalText(200),
  utmMedium: optionalText(200),
  utmCampaign: optionalText(200),
  utmContent: optionalText(200),
  company: optionalText(200),
});

type WaitlistSignup = z.infer<typeof waitlistSignupSchema>;

export function createWaitlistRoutes(databaseService: DatabaseService) {
  const app = new Hono();

  app.post('/', jsonValidator(waitlistSignupSchema), async (c) => {
    consumeRateLimit(clientIp(c.req.header()));
    const signup = c.req.valid('json');

    // Honeypot submissions get the same success response so automated form
    // fillers do not learn how to bypass the trap, but nothing is persisted.
    if (signup.company) {
      return jsonResponse(c, { status: 'joined' as const }, HttpStatus.OK);
    }

    const client = databaseService.getClient() as unknown as WaitlistDatabaseClient;
    const socialPublishJobId = await resolveSocialPublishJob(client, signup);
    const { error } = await client.from('waitlist_signups').upsert(
      {
        email: signup.email,
        social_publish_job_id: socialPublishJobId,
        cta_location: signup.ctaLocation ?? null,
        landing_path: signup.landingPath ?? null,
        referrer: signup.referrer ?? null,
        utm_source: signup.utmSource ?? null,
        utm_medium: signup.utmMedium ?? null,
        utm_campaign: signup.utmCampaign ?? null,
        utm_content: signup.utmContent ?? null,
      },
      {
        onConflict: 'email',
        // First-touch acquisition is the contract. A repeated signup should be
        // idempotent and must not rewrite the content that originally converted.
        ignoreDuplicates: true,
      },
    );
    if (error) throw new Error(error.message);

    return jsonResponse(c, { status: 'joined' as const }, HttpStatus.CREATED);
  });

  return app;
}

async function resolveSocialPublishJob(
  client: WaitlistDatabaseClient,
  signup: WaitlistSignup,
): Promise<string | null> {
  if (
    signup.utmMedium !== 'social' ||
    !signup.utmSource ||
    !SOCIAL_PLATFORMS.has(signup.utmSource) ||
    !signup.utmCampaign ||
    !UUID_REGEX.test(signup.utmCampaign) ||
    !signup.utmContent ||
    !SOCIAL_LANGUAGES.has(signup.utmContent)
  ) {
    return null;
  }

  const { data, error } = await client
    .schema('from_fed_to_chain')
    .from('social_publish_jobs')
    .select('id')
    .eq('episode_id', signup.utmCampaign)
    .eq('platform', signup.utmSource)
    .eq('language_code', signup.utmContent)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

function consumeRateLimit(ip: string): void {
  const now = Date.now();
  const current = rateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + WAITLIST_RATE_WINDOW_MS });
    sweepRateBuckets(now);
    return;
  }
  if (current.count >= WAITLIST_RATE_LIMIT) {
    throw new RateLimitException('Too many waitlist submissions');
  }
  current.count += 1;
}

function clientIp(headers: Record<string, string | undefined>): string {
  return (
    headers['fly-client-ip'] ??
    headers['cf-connecting-ip'] ??
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function sweepRateBuckets(now: number): void {
  if (rateBuckets.size < 1_000) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}
