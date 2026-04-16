import { describe, it, expect } from 'vitest';
import {
  buildSuccessApiResponse,
  buildErrorApiResponse,
  buildValidationErrorApiResponse,
  buildWebhookErrorApiResponse,
  buildSystemErrorApiResponse,
  getRequestId
} from '../../../src/utils/apiResponse.js';
import type { ApiResponse } from '../../../src/types/index.js';
import { z } from 'zod';

describe('apiResponse utilities', () => {
  describe('buildSuccessApiResponse', () => {
    it('returns a success response with data and timestamp', () => {
      const data = { foo: 'bar', baz: 123 };
      const result = buildSuccessApiResponse(data);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual(data);
      expect(typeof result.timestamp).toBe('string');
      // Verify timestamp is ISO format
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('handles empty object data', () => {
      const result = buildSuccessApiResponse({});
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual({});
    });
  });

  describe('buildErrorApiResponse', () => {
    it('returns an error response with the provided ApiError', () => {
      const error = {
        code: 'API_ERROR' as const,
        message: 'Something went wrong',
        source: 'system' as const
      };
      const result = buildErrorApiResponse(error);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toEqual(error);
      expect(typeof result.timestamp).toBe('string');
    });

    it('handles error with context', () => {
      const error = {
        code: 'VALIDATION_ERROR' as const,
        message: 'Invalid input',
        source: 'system' as const,
        context: { field: 'email' }
      };
      const result = buildErrorApiResponse(error);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.context).toEqual({ field: 'email' });
    });
  });

  describe('buildValidationErrorApiResponse', () => {
    it('wraps a ZodError into a VALIDATION_ERROR response', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const parseResult = schema.safeParse({ name: 123, age: 'not a number' });
      expect(parseResult.success).toBe(false);
      if (parseResult.success) return;

      const result = buildValidationErrorApiResponse(parseResult.error);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toBe('Invalid request payload');
      expect(result.error?.context?.issues).toBeDefined();
      expect(Array.isArray(result.error?.context?.issues)).toBe(true);
      expect((result.error?.context?.issues as unknown[]).length).toBeGreaterThan(0);
    });

    it('includes all zod validation issues', () => {
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8)
      });
      const parseResult = schema.safeParse({
        email: 'not-an-email',
        password: 'short'
      });
      expect(parseResult.success).toBe(false);
      if (parseResult.success) return;

      const result = buildValidationErrorApiResponse(parseResult.error);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.context?.issues?.length).toBe(2);
    });
  });

  describe('buildWebhookErrorApiResponse', () => {
    it('includes requestId and optional context', () => {
      const context = { detail: 'extra context' };
      const result = buildWebhookErrorApiResponse(
        'API_ERROR',
        'Webhook failed',
        'req-abc-123',
        context
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.code).toBe('API_ERROR');
      expect(result.error?.message).toBe('Webhook failed');
      expect(result.error?.context?.requestId).toBe('req-abc-123');
      expect(result.error?.context?.detail).toBe('extra context');
    });

    it('works without optional context', () => {
      const result = buildWebhookErrorApiResponse(
        'VALIDATION_ERROR',
        'Resource not found',
        'req-xyz-789'
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toBe('Resource not found');
      expect(result.error?.context?.requestId).toBe('req-xyz-789');
    });

    it('merges context correctly', () => {
      const context = { foo: 'bar', baz: 'qux' };
      const result = buildWebhookErrorApiResponse(
        'API_ERROR',
        'Request timeout',
        'req-timeout',
        context
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.context).toMatchObject({
        requestId: 'req-timeout',
        foo: 'bar',
        baz: 'qux'
      });
    });
  });

  describe('buildSystemErrorApiResponse', () => {
    it('returns an API_ERROR response from system source', () => {
      const result = buildSystemErrorApiResponse('Internal failure');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.code).toBe('API_ERROR');
      expect(result.error?.message).toBe('Internal failure');
      expect(result.error?.source).toBe('system');
    });

    it('handles empty message', () => {
      const result = buildSystemErrorApiResponse('');
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.message).toBe('');
    });

    it('handles long error messages', () => {
      const longMessage = 'a'.repeat(1000);
      const result = buildSystemErrorApiResponse(longMessage);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error?.message).toBe(longMessage);
    });
  });

  describe('getRequestId', () => {
    it('returns the x-request-id header value when present', () => {
      const headers = { 'x-request-id': 'abc-123-xyz' };
      expect(getRequestId(headers)).toBe('abc-123-xyz');
    });

    it('returns "unknown" when x-request-id header is absent', () => {
      expect(getRequestId({})).toBe('unknown');
    });

    it('returns "unknown" when x-request-id is explicitly undefined', () => {
      const headers: Record<string, unknown> = { 'x-request-id': undefined };
      expect(getRequestId(headers)).toBe('unknown');
    });

    it('returns "unknown" when x-request-id is null', () => {
      const headers: Record<string, unknown> = { 'x-request-id': null };
      expect(getRequestId(headers)).toBe('unknown');
    });

    it('returns "unknown" when passed empty object', () => {
      expect(getRequestId({})).toBe('unknown');
    });

    it('returns id with uuid-like format', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const headers = { 'x-request-id': uuid };
      expect(getRequestId(headers)).toBe(uuid);
    });

    it('returns id with special characters', () => {
      const id = 'req-2024-03-31_12:34:56-abc';
      const headers = { 'x-request-id': id };
      expect(getRequestId(headers)).toBe(id);
    });
  });
});
