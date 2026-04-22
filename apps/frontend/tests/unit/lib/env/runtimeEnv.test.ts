import { afterEach, describe, expect, it } from 'vitest';

import { getRuntimeEnv, isRuntimeMode } from '@/lib/env/runtimeEnv';

describe('getRuntimeEnv', () => {
  it('returns the value from import.meta.env when present', () => {
    // import.meta.env.VITE_TEST_VAR is set to "hello" in the Vite test env by default if we
    // assign it — we mock it via vi.stubGlobal or directly on import.meta.env
    const original = (import.meta.env as Record<string, unknown>)[
      'VITE_TEST_KEY'
    ];
    (import.meta.env as Record<string, unknown>)['VITE_TEST_KEY'] = 'from_vite';

    const result = getRuntimeEnv('VITE_TEST_KEY');
    expect(result).toBe('from_vite');

    (import.meta.env as Record<string, unknown>)['VITE_TEST_KEY'] = original;
  });

  it('falls back to process.env when import.meta.env does not have the key', () => {
    // Ensure key is absent from import.meta.env
    const originalMeta = (import.meta.env as Record<string, unknown>)[
      'VITE_PROCESS_ONLY'
    ];
    delete (import.meta.env as Record<string, unknown>)['VITE_PROCESS_ONLY'];

    const originalProcess = process.env['VITE_PROCESS_ONLY'];
    process.env['VITE_PROCESS_ONLY'] = 'from_process';

    const result = getRuntimeEnv('VITE_PROCESS_ONLY');
    expect(result).toBe('from_process');

    // Restore
    if (originalMeta !== undefined) {
      (import.meta.env as Record<string, unknown>)['VITE_PROCESS_ONLY'] =
        originalMeta;
    }
    if (originalProcess !== undefined) {
      process.env['VITE_PROCESS_ONLY'] = originalProcess;
    } else {
      delete process.env['VITE_PROCESS_ONLY'];
    }
  });

  it('returns undefined when key is absent from both import.meta.env and process.env', () => {
    const originalMeta = (import.meta.env as Record<string, unknown>)[
      'VITE_TOTALLY_ABSENT'
    ];
    delete (import.meta.env as Record<string, unknown>)['VITE_TOTALLY_ABSENT'];
    const originalProcess = process.env['VITE_TOTALLY_ABSENT'];
    delete process.env['VITE_TOTALLY_ABSENT'];

    const result = getRuntimeEnv('VITE_TOTALLY_ABSENT');
    expect(result).toBeUndefined();

    if (originalMeta !== undefined) {
      (import.meta.env as Record<string, unknown>)['VITE_TOTALLY_ABSENT'] =
        originalMeta;
    }
    if (originalProcess !== undefined) {
      process.env['VITE_TOTALLY_ABSENT'] = originalProcess;
    }
  });

  it('returns undefined when value is boolean true in import.meta.env (non-string)', () => {
    const originalMeta = (import.meta.env as Record<string, unknown>)[
      'VITE_BOOL_KEY'
    ];
    (import.meta.env as Record<string, unknown>)['VITE_BOOL_KEY'] = true;

    const originalProcess = process.env['VITE_BOOL_KEY'];
    delete process.env['VITE_BOOL_KEY'];

    const result = getRuntimeEnv('VITE_BOOL_KEY');
    // true is not a string → falls through to process.env → also absent → undefined
    expect(result).toBeUndefined();

    (import.meta.env as Record<string, unknown>)['VITE_BOOL_KEY'] =
      originalMeta;
    if (originalProcess !== undefined) {
      process.env['VITE_BOOL_KEY'] = originalProcess;
    }
  });
});

describe('isRuntimeMode', () => {
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('returns true when NODE_ENV matches the requested mode', () => {
    process.env['NODE_ENV'] = 'test';
    expect(isRuntimeMode('test')).toBe(true);
  });

  it('returns false when NODE_ENV does not match the requested mode', () => {
    process.env['NODE_ENV'] = 'test';
    expect(isRuntimeMode('production')).toBe(false);
    expect(isRuntimeMode('development')).toBe(false);
  });

  it('returns true for production mode when NODE_ENV is production', () => {
    process.env['NODE_ENV'] = 'production';
    expect(isRuntimeMode('production')).toBe(true);
  });

  it('returns true for development mode when NODE_ENV is development', () => {
    process.env['NODE_ENV'] = 'development';
    expect(isRuntimeMode('development')).toBe(true);
  });
});
