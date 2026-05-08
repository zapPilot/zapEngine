import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAllowedTelegramUserIds,
  getPort,
  getRequiredEnv,
  getTelegramBotToken,
  getTelegramWebhookSecret,
  trimTrailingSlash,
} from './env.js';

describe('getRequiredEnv', () => {
  it('returns value when env is set', () => {
    vi.stubEnv('TEST_VAR', 'hello');
    expect(getRequiredEnv('TEST_VAR')).toBe('hello');
  });

  it('throws when env is missing', () => {
    delete process.env['MISSING_VAR'];
    expect(() => getRequiredEnv('MISSING_VAR')).toThrow(
      'Missing required environment variable: MISSING_VAR',
    );
  });

  it('throws when env is empty string', () => {
    vi.stubEnv('EMPTY_VAR', '');
    expect(() => getRequiredEnv('EMPTY_VAR')).toThrow(
      'Missing required environment variable: EMPTY_VAR',
    );
  });

  it('throws when env is whitespace only', () => {
    vi.stubEnv('WHITESPACE_VAR', '   ');
    expect(() => getRequiredEnv('WHITESPACE_VAR')).toThrow(
      'Missing required environment variable: WHITESPACE_VAR',
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe('getPort', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns port from PORT env var', () => {
    vi.stubEnv('PORT', '8080');
    expect(getPort()).toBe(8080);
  });

  it('defaults to 3000 when PORT not set', () => {
    expect(getPort()).toBe(3000);
  });

  it('throws on non-numeric PORT', () => {
    vi.stubEnv('PORT', 'abc');
    expect(() => getPort()).toThrow('Invalid PORT value: abc');
  });

  it('throws on zero PORT', () => {
    vi.stubEnv('PORT', '0');
    expect(() => getPort()).toThrow('Invalid PORT value: 0');
  });

  it('throws on negative PORT', () => {
    vi.stubEnv('PORT', '-1');
    expect(() => getPort()).toThrow('Invalid PORT value: -1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe('pipeline Telegram env helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the pipeline-specific Telegram bot token env var', () => {
    vi.stubEnv('PIPELINE_TELEGRAM_BOT_TOKEN', 'pipeline-bot-token');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'account-engine-bot-token');

    expect(getTelegramBotToken()).toBe('pipeline-bot-token');
  });

  it('reads the pipeline-specific Telegram webhook secret env var', () => {
    vi.stubEnv('PIPELINE_TELEGRAM_WEBHOOK_SECRET', 'pipeline-webhook-secret');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'account-engine-webhook-secret');

    expect(getTelegramWebhookSecret()).toBe('pipeline-webhook-secret');
  });

  it('reads allowed user ids from the pipeline-specific Telegram allowlist', () => {
    vi.stubEnv('PIPELINE_TELEGRAM_ALLOWED_USER_IDS', '123, 456');
    vi.stubEnv('TELEGRAM_ALLOWED_USER_IDS', '999');

    expect(getAllowedTelegramUserIds()).toEqual(new Set(['123', '456']));
  });
});

describe('trimTrailingSlash', () => {
  it('removes single trailing slash', () => {
    expect(trimTrailingSlash('https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('returns unchanged when no trailing slash', () => {
    expect(trimTrailingSlash('https://example.com')).toBe(
      'https://example.com',
    );
    expect(trimTrailingSlash('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('handles multiple trailing slashes', () => {
    expect(trimTrailingSlash('https://example.com///')).toBe(
      'https://example.com',
    );
    expect(trimTrailingSlash('https://example.com/path//')).toBe(
      'https://example.com/path',
    );
  });
});
