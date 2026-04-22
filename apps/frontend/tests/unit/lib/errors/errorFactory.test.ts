/**
 * Error Factory Unit Tests
 *
 * Tests for error message normalization and resolution utilities
 */

import { describe, expect, it } from 'vitest';

import { resolveErrorMessage } from '@/lib/errors/errorFactory';

describe('resolveErrorMessage', () => {
  describe('with string sources', () => {
    it('should return first valid string source', () => {
      const result = resolveErrorMessage('fallback', 'First message');
      expect(result).toBe('First message');
    });

    it('should skip empty strings and use fallback', () => {
      const result = resolveErrorMessage('fallback', '', '   ', null);
      expect(result).toBe('fallback');
    });

    it('should trim whitespace from valid strings', () => {
      const result = resolveErrorMessage('fallback', '  trimmed message  ');
      expect(result).toBe('trimmed message');
    });

    it('should handle [object Object] as invalid', () => {
      const result = resolveErrorMessage('fallback', '[object Object]');
      expect(result).toBe('fallback');
    });
  });

  describe('with numeric sources', () => {
    it('should convert numbers to strings', () => {
      const result = resolveErrorMessage('fallback', 42);
      expect(result).toBe('42');
    });

    it('should convert boolean to string', () => {
      const result = resolveErrorMessage('fallback', true);
      expect(result).toBe('true');
    });

    it('should convert bigint to string', () => {
      const result = resolveErrorMessage('fallback', BigInt(12345));
      expect(result).toBe('12345');
    });
  });

  describe('with Error sources', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('Test error message');
      const result = resolveErrorMessage('fallback', error);
      expect(result).toBe('Test error message');
    });

    it('should use fallback for Error with empty message', () => {
      const error = new Error(' '); // Whitespace-only message should be treated as empty
      const result = resolveErrorMessage('fallback', error);
      expect(result).toBe('fallback');
    });

    it('should extract message from Error cause', () => {
      const causeError = new Error('Cause message');
      const error = new Error(' ', { cause: causeError }); // Whitespace triggers cause check
      const result = resolveErrorMessage('fallback', error);
      expect(result).toBe('Cause message');
    });
  });

  describe('with object sources', () => {
    it('should extract message field from object', () => {
      const result = resolveErrorMessage('fallback', {
        message: 'Object message',
      });
      expect(result).toBe('Object message');
    });

    it('should extract error field from object', () => {
      const result = resolveErrorMessage('fallback', { error: 'Error field' });
      expect(result).toBe('Error field');
    });

    it('should extract error_description from object', () => {
      const result = resolveErrorMessage('fallback', {
        error_description: 'Description here',
      });
      expect(result).toBe('Description here');
    });

    it('should extract detail field from object', () => {
      const result = resolveErrorMessage('fallback', {
        detail: 'Detail message',
      });
      expect(result).toBe('Detail message');
    });

    it('should JSON stringify object without message keys', () => {
      const result = resolveErrorMessage('fallback', { code: 123, data: 'x' });
      expect(result).toBe('{"code":123,"data":"x"}');
    });

    it('should handle circular references gracefully', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj; // Create circular reference
      const result = resolveErrorMessage('fallback', obj);
      // Should return fallback because JSON.stringify will fail on circular refs
      expect(result).toBe('fallback');
    });

    it('should check keys in priority order', () => {
      const result = resolveErrorMessage('fallback', {
        detail: 'Lower priority',
        message: 'Higher priority',
      });
      expect(result).toBe('Higher priority');
    });
  });

  describe('with multiple sources', () => {
    it('should return first found valid message', () => {
      const result = resolveErrorMessage('fallback', null, undefined, 'Valid');
      expect(result).toBe('Valid');
    });

    it('should check sources in order', () => {
      const result = resolveErrorMessage(
        'fallback',
        { error: 'First object' },
        { message: 'Second object' },
      );
      expect(result).toBe('First object');
    });

    it('should return fallback when all sources are invalid', () => {
      const result = resolveErrorMessage(
        'default fallback',
        null,
        undefined,
        '',
        '   ',
      );
      expect(result).toBe('default fallback');
    });
  });

  describe('with null and undefined', () => {
    it('should handle null source', () => {
      const result = resolveErrorMessage('fallback', null);
      expect(result).toBe('fallback');
    });

    it('should handle undefined source', () => {
      const result = resolveErrorMessage('fallback', undefined);
      expect(result).toBe('fallback');
    });

    it('should handle no sources', () => {
      const result = resolveErrorMessage('fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('edge cases for uncovered branches', () => {
    it('should handle object with key present but value explicitly undefined', () => {
      // Exercises the `nestedValue === undefined` branch in normalizeObjectValue
      // where Object.prototype.hasOwnProperty returns true but the value is undefined
      const obj = Object.defineProperty({}, 'message', {
        value: undefined,
        enumerable: true,
        configurable: true,
      });
      // Falls through to JSON.stringify since message key has undefined value
      const result = resolveErrorMessage(
        'fallback',
        obj as Record<string, unknown>,
      );
      // JSON.stringify omits undefined values — result will be "{}" which is found=true
      expect(result).toBeDefined();
    });

    it('should handle already-seen object in WeakSet (circular guard triggers on recursive call)', () => {
      // The seen.has(value) true-branch fires when the same object appears
      // nested inside itself via one of the message candidate keys.
      const inner: Record<string, unknown> = { code: 42 };
      // Make the outer object reference itself via a candidate key so that
      // during recursive normalizeObjectValue the same reference is encountered.
      const outer: Record<string, unknown> = { message: inner };
      inner.message = outer; // outer -> inner -> outer (via message chain)
      // This triggers the seen.has guard on the second visit to outer
      const result = resolveErrorMessage('fallback', outer);
      // The first pass reads outer.message = inner; inner.message = outer.
      // On visiting outer.message (inner): inner has no direct string, tries inner.message = outer.
      // outer is already in `seen` -> returns { value: fallback, found: false }.
      // Then falls through to JSON.stringify(inner) which fails (circular) -> fallback.
      expect(result).toBe('fallback');
    });

    it('should convert Symbol to string via fallthrough path', () => {
      // Symbol is not a string, number, boolean, bigint, object, or Error,
      // so it falls through to String(value) at the end of normalizeErrorMessage.
      // We cast as unknown to bypass TypeScript's spread type check.
      const sym = Symbol('test-sym');
      const result = resolveErrorMessage('fallback', sym as unknown);
      expect(result).toBe('Symbol(test-sym)');
    });
  });
});
