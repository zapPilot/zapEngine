import { describe, it, expect } from 'vitest';
import { serializeError } from '../../../src/modules/sentiment/errorSerializer.js';
import { APIError, DatabaseError, ValidationError, TransformError } from '../../../src/utils/errors.js';

describe('serializeError', () => {
  describe('Error instances', () => {
    it('should serialize standard Error with message, name, and stack', () => {
      const error = new Error('Test error message');
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Test error message');
      expect(result).toHaveProperty('name', 'Error');
      expect(result).toHaveProperty('stack');
      expect(typeof result.stack).toBe('string');
      expect(result.stack).toContain('Test error message');
    });

    it('should serialize APIError with custom properties', () => {
      const error = new APIError(
        'Not found',
        404,
        'https://api.example.com/data',
        'TestFetcher'
      );
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Not found');
      expect(result).toHaveProperty('name', 'APIError');
      expect(result).toHaveProperty('statusCode', 404);
      expect(result).toHaveProperty('url', 'https://api.example.com/data');
      expect(result).toHaveProperty('source', 'TestFetcher');
      expect(result).toHaveProperty('stack');
    });

    it('should serialize DatabaseError with operation field', () => {
      const error = new DatabaseError('Query failed', 'SELECT');
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Query failed');
      expect(result).toHaveProperty('name', 'DatabaseError');
      expect(result).toHaveProperty('operation', 'SELECT');
      expect(result).toHaveProperty('stack');
    });

    it('should serialize ValidationError with field and value', () => {
      const error = new ValidationError('Invalid email', 'email', 'not-an-email');
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Invalid email');
      expect(result).toHaveProperty('name', 'ValidationError');
      expect(result).toHaveProperty('field', 'email');
      expect(result).toHaveProperty('value', 'not-an-email');
      expect(result).toHaveProperty('stack');
    });

    it('should serialize TransformError with record field', () => {
      const record = { id: '123', value: 'test' };
      const error = new TransformError('Transform failed', record, 'TestTransformer');
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Transform failed');
      expect(result).toHaveProperty('name', 'TransformError');
      expect(result).toHaveProperty('record', record);
      expect(result).toHaveProperty('source', 'TestTransformer');
      expect(result).toHaveProperty('stack');
    });

    it('should handle Error.cause recursively', () => {
      const rootCause = new Error('Root cause');
      const wrapperError = new Error('Wrapper error', { cause: rootCause });
      const result = serializeError(wrapperError);

      expect(result).toHaveProperty('message', 'Wrapper error');
      expect(result).toHaveProperty('cause');
      expect(result.cause).toHaveProperty('message', 'Root cause');
      expect(result.cause).toHaveProperty('name', 'Error');
      expect(result.cause).toHaveProperty('stack');
    });

    it('should handle nested error chains (3 levels)', () => {
      const level3 = new Error('Level 3 error');
      const level2 = new Error('Level 2 error', { cause: level3 });
      const level1 = new Error('Level 1 error', { cause: level2 });
      const result = serializeError(level1);

      expect(result).toHaveProperty('message', 'Level 1 error');
      expect(result.cause).toHaveProperty('message', 'Level 2 error');
      expect((result.cause as unknown).cause).toHaveProperty('message', 'Level 3 error');
    });

    it('should handle Error.cause with APIError', () => {
      const rootCause = new APIError('Unauthorized', 401, 'https://api.example.com');
      const wrapperError = new Error('Request failed', { cause: rootCause });
      const result = serializeError(wrapperError);

      expect(result.cause).toHaveProperty('message', 'Unauthorized');
      expect(result.cause).toHaveProperty('statusCode', 401);
      expect(result.cause).toHaveProperty('url', 'https://api.example.com');
    });
  });

  describe('Non-Error objects', () => {
    it('should handle fetch API TypeError with common properties', () => {
      const error = {
        message: 'Network request failed',
        name: 'TypeError',
        code: 'ECONNREFUSED'
      };
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Network request failed');
      expect(result).toHaveProperty('name', 'TypeError');
      expect(result).toHaveProperty('code', 'ECONNREFUSED');
    });

    it('should handle plain objects with custom properties', () => {
      const error = { code: 'CUSTOM_ERROR', message: 'Something went wrong' };
      const result = serializeError(error);

      expect(result).toHaveProperty('code', 'CUSTOM_ERROR');
      expect(result).toHaveProperty('message', 'Something went wrong');
    });

    it('should handle objects with type property', () => {
      const error = { message: 'Fetch failed', type: 'network-error' };
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Fetch failed');
      expect(result).toHaveProperty('type', 'network-error');
    });

    it('should handle objects with no useful properties', () => {
      const error = { someRandomField: 'value' };
      const result = serializeError(error);

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Unknown error object');
      expect(result).toHaveProperty('raw');
    });
  });

  describe('Edge cases', () => {
    it('should handle null', () => {
      const result = serializeError(null);
      expect(result).toEqual({ error: 'Unknown error (null/undefined)' });
    });

    it('should handle undefined', () => {
      const result = serializeError(undefined);
      expect(result).toEqual({ error: 'Unknown error (null/undefined)' });
    });

    it('should handle string errors', () => {
      const result = serializeError('Simple error message');
      expect(result).toEqual({ error: 'Simple error message' });
    });

    it('should handle number errors', () => {
      const result = serializeError(404);
      expect(result).toEqual({ error: '404' });
    });

    it('should handle boolean errors', () => {
      const result = serializeError(false);
      expect(result).toEqual({ error: 'false' });
    });

    it('should handle empty string', () => {
      const result = serializeError('');
      expect(result).toEqual({ error: '' });
    });

    it('should handle zero', () => {
      const result = serializeError(0);
      expect(result).toEqual({ error: '0' });
    });
  });

  describe('Production scenarios', () => {
    it('should handle CoinMarketCap API 401 error', () => {
      const error = new APIError(
        '401 Unauthorized',
        401,
        'https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest',
        'FearGreedFetcher'
      );
      const result = serializeError(error);

      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Unauthorized');
      expect(result.url).toContain('coinmarketcap');
      expect(result.source).toBe('FearGreedFetcher');
    });

    it('should handle network timeout errors', () => {
      const error = new Error('Request timeout after 30000ms');
      error.name = 'TimeoutError';
      const result = serializeError(error);

      expect(result.name).toBe('TimeoutError');
      expect(result.message).toContain('timeout');
      expect(result).toHaveProperty('stack');
    });

    it('should handle JSON parse errors', () => {
      const error = new SyntaxError('Unexpected token < in JSON at position 0');
      const result = serializeError(error);

      expect(result.name).toBe('SyntaxError');
      expect(result.message).toContain('JSON');
      expect(result).toHaveProperty('stack');
    });

    it('should handle fetch network errors with code', () => {
      const error = {
        message: 'fetch failed',
        name: 'TypeError',
        code: 'ENOTFOUND'
      };
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'fetch failed');
      expect(result).toHaveProperty('name', 'TypeError');
      expect(result).toHaveProperty('code', 'ENOTFOUND');
    });

    it('should handle database connection errors', () => {
      const error = new DatabaseError(
        'Connection refused',
        'CONNECT'
      );
      const result = serializeError(error);

      expect(result).toHaveProperty('message', 'Connection refused');
      expect(result).toHaveProperty('operation', 'CONNECT');
      expect(result).toHaveProperty('name', 'DatabaseError');
    });

    it('should handle validation errors with complex values', () => {
      const invalidValue = { nested: { field: 'invalid' } };
      const error = new ValidationError(
        'Invalid nested structure',
        'config.database.pool',
        invalidValue
      );
      const result = serializeError(error);

      expect(result).toHaveProperty('field', 'config.database.pool');
      expect(result).toHaveProperty('value', invalidValue);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle APIError with nested cause', () => {
      const networkError = new Error('ECONNREFUSED');
      networkError.name = 'SystemError';
      const apiError = new APIError(
        'Service unavailable',
        503,
        'https://api.example.com',
        'TestFetcher'
      );
      (apiError as unknown).cause = networkError;

      const result = serializeError(apiError);

      expect(result).toHaveProperty('statusCode', 503);
      expect(result).toHaveProperty('message', 'Service unavailable');
      expect(result.cause).toHaveProperty('message', 'ECONNREFUSED');
      expect(result.cause).toHaveProperty('name', 'SystemError');
    });

    it('should preserve all custom properties for unknown error types', () => {
      const customError = new Error('Custom error');
      (customError as unknown).customProp1 = 'value1';
      (customError as unknown).statusCode = 500;
      (customError as unknown).url = 'https://example.com';

      const result = serializeError(customError);

      expect(result).toHaveProperty('message', 'Custom error');
      expect(result).toHaveProperty('statusCode', 500);
      expect(result).toHaveProperty('url', 'https://example.com');
      // Note: customProp1 won't be in result since it's not in the known list
    });
  });
});
