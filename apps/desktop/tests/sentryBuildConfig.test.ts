import { describe, expect, it } from 'vitest';

import { buildDesktopSentryOptions } from '../src/main/sentry';
import {
  resolveSentryDsn,
  resolveSentryRelease,
} from '../src/main/sentryBuildConfig';

describe('resolveSentryDsn', () => {
  it('prefers baked value when present and trimmed', () => {
    expect(
      resolveSentryDsn(
        ' https://baked@sentry.example/1 ',
        'https://runtime@sentry.example/2',
      ),
    ).toBe('https://baked@sentry.example/1');
  });

  it('falls back to runtime when baked is empty', () => {
    expect(resolveSentryDsn('', 'https://runtime@sentry.example/2')).toBe(
      'https://runtime@sentry.example/2',
    );
    expect(resolveSentryDsn('   ', 'https://runtime@sentry.example/2')).toBe(
      'https://runtime@sentry.example/2',
    );
    expect(
      resolveSentryDsn(undefined, 'https://runtime@sentry.example/2'),
    ).toBe('https://runtime@sentry.example/2');
  });

  it('trims runtime fallback', () => {
    expect(resolveSentryDsn('', ' https://runtime@sentry.example/2 ')).toBe(
      'https://runtime@sentry.example/2',
    );
  });

  it('returns undefined when both baked and runtime are blank', () => {
    expect(resolveSentryDsn('', '')).toBeUndefined();
    expect(resolveSentryDsn(undefined, undefined)).toBeUndefined();
    expect(resolveSentryDsn('   ', '  ')).toBeUndefined();
  });

  it('packaged app with baked DSN does not need runtime env', () => {
    // Simulates DMG cold launch: no process.env, only baked DSN from build.mjs
    const dsn = resolveSentryDsn('https://baked@sentry.example/1', undefined);
    expect(dsn).toBe('https://baked@sentry.example/1');
    expect(buildDesktopSentryOptions(dsn, 'abc123')).toBeDefined();
  });

  it('build without DSN keeps Sentry disabled (local/dev unaffected)', () => {
    const dsn = resolveSentryDsn('', undefined);
    expect(dsn).toBeUndefined();
    expect(buildDesktopSentryOptions(dsn, 'abc123')).toBeUndefined();
  });

  it('local dev can still use runtime env when baked is empty', () => {
    const dsn = resolveSentryDsn('', 'https://runtime@sentry.example/2');
    expect(buildDesktopSentryOptions(dsn, 'dev')).toEqual(
      expect.objectContaining({ dsn: 'https://runtime@sentry.example/2' }),
    );
  });
});

describe('resolveSentryRelease', () => {
  it('prefers baked release', () => {
    expect(resolveSentryRelease(' baked-sha ', 'runtime-sha', '1.0.0')).toBe(
      'baked-sha',
    );
  });

  it('falls back to runtime release when baked is blank', () => {
    expect(resolveSentryRelease('', ' runtime-sha ', '1.0.0')).toBe(
      'runtime-sha',
    );
    expect(resolveSentryRelease(undefined, 'runtime-sha', '1.0.0')).toBe(
      'runtime-sha',
    );
  });

  it('falls back to app.getVersion() when both baked and runtime are blank', () => {
    expect(resolveSentryRelease('', '', '1.0.0')).toBe('1.0.0');
    expect(resolveSentryRelease(undefined, undefined, '0.1.0')).toBe('0.1.0');
    expect(resolveSentryRelease('  ', '  ', '  0.1.0  ')).toBe('0.1.0');
  });

  it('returns undefined when appVersion is also blank', () => {
    expect(resolveSentryRelease('', '', '')).toBeUndefined();
    expect(resolveSentryRelease('', '', '  ')).toBeUndefined();
  });

  it('produces release that buildDesktopSentryOptions accepts', () => {
    const release = resolveSentryRelease('abc123', undefined, '0.1.0');
    expect(
      buildDesktopSentryOptions('https://public@sentry.example/1', release),
    ).toEqual(expect.objectContaining({ release: 'abc123' }));
  });

  it('empty baked and runtime still yields appVersion release', () => {
    const release = resolveSentryRelease('', undefined, '0.1.0');
    expect(
      buildDesktopSentryOptions('https://public@sentry.example/1', release),
    ).toEqual(expect.objectContaining({ release: '0.1.0' }));
  });
});

describe('packaged vs dev Sentry enablement', () => {
  it('build with DSN → Sentry.init enabled', () => {
    const dsn = resolveSentryDsn('https://public@sentry.example/1', undefined);
    const release = resolveSentryRelease('abc123', undefined, '0.1.0');
    const options = buildDesktopSentryOptions(dsn, release);
    expect(options).toEqual({
      dsn: 'https://public@sentry.example/1',
      enableLogs: false,
      release: 'abc123',
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });

  it('build without DSN → Sentry stays no-op', () => {
    const dsn = resolveSentryDsn('', undefined);
    const release = resolveSentryRelease('', undefined, '0.1.0');
    expect(buildDesktopSentryOptions(dsn, release)).toBeUndefined();
  });

  it('preserves error-only, no-PII, no-OpenTelemetry invariants', () => {
    const options = buildDesktopSentryOptions(
      'https://public@sentry.example/1',
      'release',
    );
    expect(options).toMatchObject({
      enableLogs: false,
      sendDefaultPii: false,
      skipOpenTelemetrySetup: true,
    });
  });
});
