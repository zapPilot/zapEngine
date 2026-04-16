import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { errorHandler, notFoundHandler } from '../../../src/middleware/errorHandler.js';
import {
  APIError,
  DatabaseError,
  ETLError,
  TransformError,
  ValidationError
} from '../../../src/utils/errors.js';
import { logger } from '../../../src/utils/logger.js';

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: { 'x-request-id': 'test-req-123' },
      method: 'POST',
      path: '/webhooks/pipedream'
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    mockNext = vi.fn();
  });

  describe('error resolution', () => {
    it('handles ZodError responses with validation issues', () => {
      const error = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['source'],
          message: 'Expected string, received number'
        }
      ]);

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload',
            source: 'system',
            context: expect.objectContaining({
              issues: expect.arrayContaining([
                expect.objectContaining({ path: ['source'] })
              ])
            })
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('handles APIError with explicit status code and valid source', () => {
      const error = new APIError(
        'DeFiLlama API rate limit exceeded',
        429,
        'https://api.llama.fi/pools',
        'defillama'
      );

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'API_ERROR',
            message: 'DeFiLlama API rate limit exceeded',
            source: 'defillama',
            context: expect.objectContaining({
              url: 'https://api.llama.fi/pools',
              requestId: 'test-req-123'
            })
          })
        })
      );
    });

    it('preserves database as a normalized APIError source', () => {
      const error = new APIError(
        'Database proxy request failed',
        502,
        'postgres://proxy.internal',
        'database'
      );

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'API_ERROR',
            source: 'database',
            context: expect.objectContaining({
              url: 'postgres://proxy.internal',
              requestId: 'test-req-123'
            })
          })
        })
      );
    });

    it('defaults invalid APIError sources to system', () => {
      const error = new APIError('Unknown API error', 500, 'https://api.example.com', 'external-api');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'API_ERROR',
            source: 'system',
            context: expect.objectContaining({
              url: 'https://api.example.com',
              requestId: 'test-req-123'
            })
          })
        })
      );
    });

    it('handles ValidationError with field metadata', () => {
      const error = new ValidationError('Invalid chain parameter', 'chain', 'invalid-chain');

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            context: expect.objectContaining({
              field: 'chain',
              value: 'invalid-chain',
              requestId: 'test-req-123'
            })
          })
        })
      );
    });

    it('handles DatabaseError and logs full details', () => {
      const error = new DatabaseError(
        'INSERT INTO pool_apr_snapshots failed: duplicate key',
        'INSERT INTO pool_apr_snapshots'
      );

      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'DATABASE_ERROR',
            message: 'Database operation failed',
            source: 'database',
            context: expect.objectContaining({
              requestId: 'test-req-123'
            })
          })
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Database Error:',
        expect.objectContaining({
          error,
          requestId: 'test-req-123'
        })
      );
    });

    it('handles TransformError and ETLError as internal errors', () => {
      const transformError = new TransformError(
        'Failed to transform pool data',
        { poolId: 'abc-123' },
        'defillama'
      );
      const etlError = new ETLError('ETL pipeline failed', 'hyperliquid');

      errorHandler(transformError, mockReq as Request, mockRes as Response, mockNext);
      errorHandler(etlError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenNthCalledWith(1, 500);
      expect(mockRes.status).toHaveBeenNthCalledWith(2, 500);
      expect(mockRes.json).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'Failed to transform pool data',
            source: 'defillama'
          })
        })
      );
      expect(mockRes.json).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'ETL pipeline failed',
            source: 'hyperliquid'
          })
        })
      );
    });

    it('handles generic Error and non-Error inputs', () => {
      const genericError = new Error('Unexpected error occurred');
      const stringError = 'Something went wrong!';

      errorHandler(genericError, mockReq as Request, mockRes as Response, mockNext);
      errorHandler(stringError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenNthCalledWith(1, 500);
      expect(mockRes.status).toHaveBeenNthCalledWith(2, 500);
      expect(mockRes.json).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            source: 'system',
            context: expect.objectContaining({ requestId: 'test-req-123' })
          })
        })
      );
      expect(mockRes.json).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            source: 'system',
            context: expect.objectContaining({ requestId: 'test-req-123' })
          })
        })
      );
      expect(logger.error).toHaveBeenNthCalledWith(
        1,
        'Unhandled System Error:',
        expect.objectContaining({
          error: genericError,
          requestId: 'test-req-123',
          stack: expect.any(String)
        })
      );
      expect(logger.error).toHaveBeenNthCalledWith(
        2,
        'Unhandled System Error:',
        expect.objectContaining({
          error: stringError,
          requestId: 'test-req-123',
          stack: undefined
        })
      );
    });
  });

  describe('requestId context handling', () => {
    it('adds requestId when error context is missing or partial', () => {
      class CustomErrorNoContext extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomErrorNoContext';
        }
      }

      const errorWithoutContext = new CustomErrorNoContext('Custom error without context');
      const apiError = new APIError('API error with partial context', 500, 'https://api.example.com');

      errorHandler(errorWithoutContext, mockReq as Request, mockRes as Response, mockNext);
      errorHandler(apiError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          error: expect.objectContaining({
            context: expect.objectContaining({ requestId: 'test-req-123' })
          })
        })
      );
      expect(mockRes.json).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          error: expect.objectContaining({
            context: expect.objectContaining({
              requestId: 'test-req-123',
              url: 'https://api.example.com'
            })
          })
        })
      );
    });
  });

  describe('notFoundHandler', () => {
    it('returns 404 for unmatched routes and includes method/path', () => {
      notFoundHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'NOT_FOUND',
            message: 'Route not found: POST /webhooks/pipedream',
            source: 'system',
            context: expect.objectContaining({
              requestId: 'test-req-123'
            })
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('uses unknown requestId when header is absent', () => {
      mockReq.headers = {};

      notFoundHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            context: expect.objectContaining({
              requestId: 'unknown'
            })
          })
        })
      );
    });
  });

  it('returns a consistent ApiResponse structure across error types', () => {
    const errors = [
      new ZodError([]),
      new APIError('API error', 400, 'url', 'source'),
      new ValidationError('Validation error', 'field', 'value'),
      new DatabaseError('DB error', 'operation'),
      new TransformError('Transform error', {}),
      new ETLError('ETL error'),
      new Error('Generic error')
    ];

    for (const error of errors) {
      vi.clearAllMocks();
      errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

      const response = (mockRes.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error).toHaveProperty('source');
      expect(response.error).toHaveProperty('context');
      expect(response).toHaveProperty('timestamp');
    }
  });
});
