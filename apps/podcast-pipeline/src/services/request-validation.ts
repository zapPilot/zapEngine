import { timingSafeEqual } from 'node:crypto';

import { HTTPException } from 'hono/http-exception';

import {
  DEFAULT_LANGUAGE_CODE,
  type LanguageClassroomLanguageCode,
  LEGACY_LANGUAGE_ALIASES,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';

export function parseInputUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL must use http or https');
    }

    return url.toString();
  } catch {
    throw new HTTPException(400, { message: 'Invalid url' });
  }
}

export function isEpisodeId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parsePrimaryLanguageCode(
  value: unknown,
): LanguageClassroomLanguageCode {
  const rawLanguageCode =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : DEFAULT_LANGUAGE_CODE;
  const languageCode =
    LEGACY_LANGUAGE_ALIASES[
      rawLanguageCode as keyof typeof LEGACY_LANGUAGE_ALIASES
    ] ?? rawLanguageCode;

  if (
    !(SUPPORTED_PRIMARY_LANGUAGE_CODES as readonly string[]).includes(
      languageCode,
    )
  ) {
    throw new HTTPException(400, {
      message: `Unsupported language: ${rawLanguageCode}`,
    });
  }

  return languageCode;
}

export function parseEpisodeSearchQuery(value: unknown): string {
  const query = typeof value === 'string' ? value.trim() : '';
  const length = Array.from(query).length;
  if (length < 2 || length > 120) {
    throw new HTTPException(400, {
      message: 'Search query must contain 2 to 120 characters',
    });
  }
  return query;
}

export function parseEpisodeSearchLimit(value: unknown): number {
  if (value === undefined) return 20;
  const limit = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HTTPException(400, {
      message: 'Search limit must be an integer from 1 to 50',
    });
  }
  return limit;
}

export function requireAdminAuthorization(
  authorization: string | undefined,
): void {
  const expectedToken = process.env['INGEST_ADMIN_TOKEN'];
  if (!expectedToken) {
    throw new HTTPException(500, {
      message: 'INGEST_ADMIN_TOKEN is not configured',
    });
  }

  const actualToken = parseBearerToken(authorization);
  if (!actualToken || !safeTokenEqual(actualToken, expectedToken)) {
    throw new HTTPException(401, { message: 'Unauthorized' });
  }
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const [scheme, ...tokenParts] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;

  const token = tokenParts.join(' ');
  return token.length > 0 ? token : null;
}

function safeTokenEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
