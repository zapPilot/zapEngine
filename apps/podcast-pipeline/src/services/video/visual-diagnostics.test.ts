import { describe, expect, it } from 'vitest';

import {
  buildVisualFailureDiagnostics,
  VISUAL_FAILURE_DIAGNOSTICS_SCHEMA_VERSION,
  type VisualFailureDiagnostics,
  visualFailureDiagnosticsFor,
  VisualPlanningError,
} from './visual-diagnostics.js';

function build(
  overrides: Partial<Parameters<typeof buildVisualFailureDiagnostics>[0]> = {},
): VisualFailureDiagnostics {
  return buildVisualFailureDiagnostics({
    visualVersion: 'image-slideshow-v5',
    runId: 'run-1',
    attempt: 2,
    stage: 'plan-assets',
    error: new Error('planning failed'),
    ...overrides,
  });
}

describe('buildVisualFailureDiagnostics', () => {
  it('records the schema version, stage, message and a timestamp', () => {
    const diagnostics = build();
    expect(diagnostics).toEqual({
      schemaVersion: VISUAL_FAILURE_DIAGNOSTICS_SCHEMA_VERSION,
      visualVersion: 'image-slideshow-v5',
      runId: 'run-1',
      attempt: 2,
      failedAt: expect.any(String),
      stage: 'plan-assets',
      message: 'planning failed',
    });
    expect(Number.isNaN(Date.parse(diagnostics.failedAt))).toBe(false);
    expect(diagnostics).not.toHaveProperty('snapshot');
  });

  it('stringifies non-Error causes', () => {
    expect(build({ error: 'string failure' }).message).toBe('string failure');
  });

  it('truncates the message, visual version and run id', () => {
    const diagnostics = build({
      error: new Error('x'.repeat(4500)),
      visualVersion: 'v'.repeat(200),
      runId: 'r'.repeat(121),
    });
    expect(diagnostics.message).toHaveLength(4000);
    expect(diagnostics.visualVersion).toHaveLength(120);
    expect(diagnostics.runId).toHaveLength(120);
  });

  it('normalizes attempt to a non-negative integer', () => {
    expect(build({ attempt: -3 }).attempt).toBe(0);
    expect(build({ attempt: 2.9 }).attempt).toBe(2);
    expect(build({ attempt: -0.5 }).attempt).toBe(0);
  });

  it('redacts sensitive keys and clips long strings and arrays in the snapshot', () => {
    const diagnostics = build({
      snapshot: {
        script: 'full transcript',
        nested: {
          accessToken: 'abc',
          clientSecret: 'shh',
          apiKey: 'k1',
          api_key: 'k2',
          CanonicalScript: 'again',
          safe: 'kept',
        },
        long: 'y'.repeat(2500),
        list: Array.from({ length: 300 }, (_, index) => index),
        count: 3,
        flag: true,
        nothing: null,
      },
    });

    expect(diagnostics.snapshot).toEqual({
      script: '[redacted]',
      nested: {
        accessToken: '[redacted]',
        clientSecret: '[redacted]',
        apiKey: '[redacted]',
        api_key: '[redacted]',
        CanonicalScript: '[redacted]',
        safe: 'kept',
      },
      long: 'y'.repeat(2000),
      list: Array.from({ length: 256 }, (_, index) => index),
      count: 3,
      flag: true,
      nothing: null,
    });
  });

  it('falls back to a clipped summary when the snapshot exceeds the size budget', () => {
    const snapshot: Record<string, unknown> = {};
    for (let index = 0; index < 20; index += 1) {
      snapshot[`field${index}`] = 'z'.repeat(1999);
    }

    const diagnostics = build({ snapshot });

    expect(Object.keys(diagnostics.snapshot ?? {})).toEqual(['summary']);
    const summary = diagnostics.snapshot?.['summary'];
    expect(typeof summary).toBe('string');
    expect((summary as string).length).toBe(31_000);
    expect((summary as string).startsWith('{"field0":"zzz')).toBe(true);
  });
});

describe('VisualPlanningError', () => {
  it('keeps the cause message, the cause itself and the diagnostics', () => {
    const cause = new Error('upstream boom');
    const diagnostics = build({ error: cause });
    const error = new VisualPlanningError(cause, diagnostics);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('VisualPlanningError');
    expect(error.message).toBe('upstream boom');
    expect(error.cause).toBe(cause);
    expect(error.diagnostics).toBe(diagnostics);
    expect(visualFailureDiagnosticsFor(error)).toBe(diagnostics);
  });

  it('is not recognised for plain errors or non-errors', () => {
    expect(visualFailureDiagnosticsFor(new Error('plain'))).toBeNull();
    expect(visualFailureDiagnosticsFor('string')).toBeNull();
    expect(visualFailureDiagnosticsFor(null)).toBeNull();
  });
});
