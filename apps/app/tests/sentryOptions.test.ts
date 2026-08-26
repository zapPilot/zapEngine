import { describe, expect, it } from 'vitest';

import { buildAppSentryOptions } from '../src/observability/sentryOptions';

describe('buildAppSentryOptions', () => {
  it('is disabled when the DSN is blank', () => {
    expect(buildAppSentryOptions(undefined, '2.1.0')).toBeUndefined();
    expect(buildAppSentryOptions('   ', '2.1.0')).toBeUndefined();
  });

  it('enables error-only reporting without PII', () => {
    expect(
      buildAppSentryOptions(' https://public@sentry.example/1 ', ' 2.1.0 '),
    ).toEqual({
      dsn: 'https://public@sentry.example/1',
      enableAutoSessionTracking: false,
      enableLogs: false,
      release: '2.1.0',
      sendDefaultPii: false,
    });
  });

  it('leaves release undefined when build metadata is absent', () => {
    expect(
      buildAppSentryOptions('https://public@sentry.example/1', ''),
    ).toEqual(expect.objectContaining({ release: undefined }));
  });
});
