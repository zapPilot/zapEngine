import { describe, expect, it } from 'vitest';

import { buildDesktopSentryOptions } from '../src/main/sentry';

describe('buildDesktopSentryOptions', () => {
  it('is disabled when the DSN is blank', () => {
    expect(buildDesktopSentryOptions(undefined, '0.1.0')).toBeUndefined();
    expect(buildDesktopSentryOptions('  ', '0.1.0')).toBeUndefined();
  });

  it('enables error-only reporting without PII or OpenTelemetry setup', () => {
    expect(
      buildDesktopSentryOptions(
        ' https://public@sentry.example/1 ',
        ' commit-sha ',
      ),
    ).toEqual({
      dsn: 'https://public@sentry.example/1',
      enableLogs: false,
      release: 'commit-sha',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('leaves release undefined when metadata is absent', () => {
    expect(
      buildDesktopSentryOptions('https://public@sentry.example/1', ''),
    ).toEqual(expect.objectContaining({ release: undefined }));
  });
});
