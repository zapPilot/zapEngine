import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAllowedTelegramUserIds,
  getIntEnv,
  getPort,
  getRequiredEnv,
  getTelegramBotToken,
  getTelegramWebhookSecret,
  readFlyMachinesConfig,
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

describe('getIntEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses the env value when it is at or above min', () => {
    vi.stubEnv('TUNING_VAR', ' 42 ');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 1 })).toBe(42);
    vi.stubEnv('TUNING_VAR', '0');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 0 })).toBe(0);
  });

  it('falls back to the default when unset, blank or unparseable', () => {
    delete process.env['TUNING_VAR'];
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 1 })).toBe(7);
    vi.stubEnv('TUNING_VAR', '   ');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 1 })).toBe(7);
    vi.stubEnv('TUNING_VAR', 'abc');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 1 })).toBe(7);
  });

  it('falls back to the default when the value is below min', () => {
    vi.stubEnv('TUNING_VAR', '0');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 1 })).toBe(7);
    vi.stubEnv('TUNING_VAR', '-1');
    expect(getIntEnv('TUNING_VAR', { default: 7, min: 0 })).toBe(7);
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

describe('readFlyMachinesConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, '', '   '])(
    'reports no Fly platform for FLY_APP_NAME %o',
    (appName) => {
      if (appName === undefined) delete process.env['FLY_APP_NAME'];
      else vi.stubEnv('FLY_APP_NAME', appName);
      vi.stubEnv('PIPELINE_FLY_API_TOKEN', 'token');
      vi.stubEnv('FLY_IMAGE_REF', 'registry.fly.io/podcast:deployment');

      expect(readFlyMachinesConfig()).toBeNull();
    },
  );

  // On Fly there is exactly one deployment mode, so a missing token has to be a
  // configuration error rather than a quieter fallback.
  it.each([undefined, '   '])(
    'throws on Fly when the API token is %o',
    (token) => {
      vi.stubEnv('FLY_APP_NAME', 'podcast-app');
      if (token === undefined) delete process.env['PIPELINE_FLY_API_TOKEN'];
      else vi.stubEnv('PIPELINE_FLY_API_TOKEN', token);

      expect(() => readFlyMachinesConfig()).toThrow(/PIPELINE_FLY_API_TOKEN/);
    },
  );

  it.each([undefined, '   '])(
    'throws on Fly when the current image ref is %o',
    (imageRef) => {
      vi.stubEnv('FLY_APP_NAME', 'podcast-app');
      vi.stubEnv('PIPELINE_FLY_API_TOKEN', 'token');
      if (imageRef === undefined) delete process.env['FLY_IMAGE_REF'];
      else vi.stubEnv('FLY_IMAGE_REF', imageRef);

      expect(() => readFlyMachinesConfig()).toThrow(/FLY_IMAGE_REF/);
    },
  );

  it('returns trimmed wake credentials when fully configured', () => {
    vi.stubEnv('FLY_APP_NAME', ' podcast-app ');
    vi.stubEnv('PIPELINE_FLY_API_TOKEN', ' token ');
    vi.stubEnv('FLY_IMAGE_REF', ' registry.fly.io/podcast:deployment ');

    expect(readFlyMachinesConfig()).toEqual({
      appName: 'podcast-app',
      token: 'token',
      currentImageRef: 'registry.fly.io/podcast:deployment',
    });
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
