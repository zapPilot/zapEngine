/**
 * Unit tests for errorHandling utilities
 */
import { wrapServiceCall } from '@zapengine/app-core/lib/errors/errorHandling';
import { describe, expect, it, vi } from 'vitest';

describe('errorHandling', () => {
  describe('wrapServiceCall', () => {
    it('should return success with data when operation succeeds', async () => {
      const result = await wrapServiceCall(async () => {
        return { id: 1, name: 'Test' };
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'Test' });
      expect(result.error).toBeUndefined();
    });

    it('should return success for void operations', async () => {
      const mockFn = vi.fn();

      const result = await wrapServiceCall(async () => {
        mockFn();
      });

      expect(result.success).toBe(true);
      expect(mockFn).toHaveBeenCalled();
    });

    it('should return error message when operation throws Error', async () => {
      const result = await wrapServiceCall(async () => {
        throw new Error('Operation failed');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed');
      expect(result.data).toBeUndefined();
    });

    it('should return unknown error for non-Error throws', async () => {
      const result = await wrapServiceCall(async () => {
        throw 'string error';
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });

    it('should handle async operations correctly', async () => {
      const result = await wrapServiceCall(async () => {
        await Promise.resolve();
        return 'delayed result';
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('delayed result');
    });

    it('should handle null return values', async () => {
      const result = await wrapServiceCall(async () => {
        return null;
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });
});
