/**
 * Unit tests for env utilities
 */
import {
  getAppRuntime,
  isDesktopRuntime,
  toSeconds,
} from '@zapengine/app-core/lib/env/runtimeEnv';
import { afterEach, describe, expect, it } from 'vitest';

describe('env', () => {
  afterEach(() => {
    delete process.env['VITE_APP_RUNTIME'];
  });

  describe('getAppRuntime', () => {
    it('defaults to web when VITE_APP_RUNTIME is unset', () => {
      expect(getAppRuntime()).toBe('web');
    });

    it('returns desktop when VITE_APP_RUNTIME is desktop', () => {
      process.env['VITE_APP_RUNTIME'] = 'desktop';

      expect(getAppRuntime()).toBe('desktop');
      expect(isDesktopRuntime()).toBe(true);
    });

    it('returns native when VITE_APP_RUNTIME is native', () => {
      process.env['VITE_APP_RUNTIME'] = 'native';

      expect(getAppRuntime()).toBe('native');
      expect(isDesktopRuntime()).toBe(false);
    });

    it('falls back to web for unknown VITE_APP_RUNTIME values', () => {
      process.env['VITE_APP_RUNTIME'] = 'embedded';

      expect(getAppRuntime()).toBe('web');
      expect(isDesktopRuntime()).toBe(false);
    });
  });

  describe('toSeconds', () => {
    it('should return fallback for undefined value', () => {
      expect(toSeconds(undefined, 3600)).toBe(3600);
    });

    it('should return fallback for empty string', () => {
      expect(toSeconds('', 3600)).toBe(3600);
    });

    it('should parse valid number string', () => {
      expect(toSeconds('7200', 3600)).toBe(7200);
    });

    it('should parse zero correctly', () => {
      expect(toSeconds('0', 3600)).toBe(0);
    });

    it('should parse negative numbers', () => {
      expect(toSeconds('-100', 3600)).toBe(-100);
    });

    it('should parse decimal numbers', () => {
      expect(toSeconds('3.14', 0)).toBe(3.14);
    });

    it('should return fallback for non-numeric string', () => {
      expect(toSeconds('not-a-number', 3600)).toBe(3600);
    });

    it('should return fallback for NaN', () => {
      expect(toSeconds('NaN', 3600)).toBe(3600);
    });

    it('should return fallback for Infinity', () => {
      expect(toSeconds('Infinity', 3600)).toBe(3600);
    });

    it('should return fallback for -Infinity', () => {
      expect(toSeconds('-Infinity', 3600)).toBe(3600);
    });
  });
});
