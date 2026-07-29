import { describe, it, expect } from 'vitest';
import { serializeError } from '../../../src/utils/errorSerializer.js';

describe('Utils', () => {
  describe('errorSerializer', () => {
    it('should handle error during serialization of non-Error object', () => {
      // To trigger catch block in serializeError for object type:
      // We need an object that throws when accessing properties?
      const badObj = {};
      Object.defineProperty(badObj, 'message', {
        get: () => {
          throw new Error('Access failed');
        },
      });

      const result = serializeError(badObj);
      expect(result.error).toBe('Error serialization failed');
    });
  });
});
