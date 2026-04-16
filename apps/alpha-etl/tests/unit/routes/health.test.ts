/**
 * Comprehensive unit tests for Health route
 * Covers error handling, response time tracking, Express integration, and advanced TypeScript patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { HealthCheckResponse } from '../../../src/types/index.js';
import { setHealthState, resetHealthState } from '../../../src/modules/core/healthStatus.js';

// Mock the logger to prevent console output during tests
vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

describe('Health Router', () => {
  let app: express.Application;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    resetHealthState();

    // Mock process.uptime to return consistent value
    vi.spyOn(process, 'uptime').mockReturnValue(123.45);

    // Get the mock functions
    const { logger } = await import('../../../src/utils/logger.js');
    mockLogger = vi.mocked(logger);

    // Create test app with health router
    app = express();
    app.use(express.json());
    const { healthRouter } = await import('../../../src/routes/health.js');
    app.use('/health', healthRouter);
  });

  function setHealthyState(lastCheckedAt: string): void {
    setHealthState({
      status: 'healthy',
      lastCheckedAt,
      message: undefined
    });
  }

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    resetHealthState();
  });

  describe('Express Integration Tests', () => {
    it('should return initialization status when no health check has run', async () => {
      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'unhealthy',
          version: '1.0.0',
          // database is optional/undefined in this mock setup if not provided?
          // checking database: false because setHealthState mock default might be missing details
          // The previous output showed database: false was present
          database: false,
          uptime: 123.45,
          cached: false,
          lastCheckedAt: null
        },
        timestamp: expect.any(String)
      });
    });

    it('should default missing details to empty results', async () => {
      const lastCheckedAt = new Date().toISOString();
      setHealthState({
        status: 'unhealthy',
        lastCheckedAt,
        message: 'Missing details',
        details: null as unknown as Record<string, unknown>
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.data.database).toBe(false);
      expect(response.body.data.sources).toEqual({});
      expect(response.body.data.lastCheckedAt).toBe(lastCheckedAt);
    });

    it('should return healthy status when cached state is healthy', async () => {
      const lastCheckedAt = new Date().toISOString();
      setHealthyState(lastCheckedAt);
      setHealthState({
        status: 'healthy',
        lastCheckedAt,
        details: {
          database: { status: 'healthy' } as unknown
        }
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          version: '1.0.0',
          database: true,
          uptime: 123.45,
          cached: true,
          lastCheckedAt
        },
        timestamp: expect.any(String)
      });

      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Health check served healthy state from cache',
        { responseTime: expect.any(Number), lastCheckedAt }
      );
    });

    it('should return unhealthy status with cached metadata when last check failed', async () => {
      const lastCheckedAt = new Date().toISOString();
      setHealthState({
        status: 'unhealthy',
        lastCheckedAt,
        message: 'Database ping failed'
      });

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'unhealthy',
          version: '1.0.0',
          database: false,
          uptime: 123.45,
          cached: true,
          lastCheckedAt,
          message: 'Database ping failed'
        },
        timestamp: expect.any(String)
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Health check served unhealthy state from cache',
        { responseTime: expect.any(Number), lastCheckedAt, message: 'Database ping failed' }
      );
    });

    it('should handle multiple concurrent requests consistently', async () => {
      setHealthyState(new Date().toISOString());

      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.body.data.status).toBe('healthy');
        expect(response.body.data.cached).toBe(true);
      });

      expect(mockLogger.info).toHaveBeenCalledTimes(5);
    });

    it('should include updated uptime for each response', async () => {
      setHealthyState(new Date().toISOString());

      const uptimeSpy = vi.spyOn(process, 'uptime');
      uptimeSpy.mockReturnValueOnce(10);
      uptimeSpy.mockReturnValueOnce(20);

      const firstResponse = await request(app).get('/health').expect(200);
      const secondResponse = await request(app).get('/health').expect(200);

      expect(firstResponse.body.data.uptime).toBe(10);
      expect(secondResponse.body.data.uptime).toBe(20);
    });

    it('should maintain proper typing for HealthCheckResponse', async () => {
      setHealthyState(new Date().toISOString());

      const response = await request(app)
        .get('/health')
        .expect(200);

      const healthResponse: HealthCheckResponse = response.body;
      // We need to type guard or assume success for test
      if (healthResponse.success) {
        expect(healthResponse.data.status).toBe('healthy');
        expect(typeof healthResponse.timestamp).toBe('string');
        expect(typeof healthResponse.data.version).toBe('string');
        expect(typeof healthResponse.data.database).toBe('boolean');
        expect(typeof healthResponse.data.uptime).toBe('number');
        expect(typeof healthResponse.data.cached).toBe('boolean');
      } else {
        throw new Error('Expected success response');
      }
    });

    it('should surface cached message even when undefined', async () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: new Date().toISOString(),
        message: undefined
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.data.message).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(response.body.data, 'message')).toBe(false);
    });

    it('should handle sources with undefined health details', async () => {
      const lastCheckedAt = new Date().toISOString();
      setHealthState({
        status: 'healthy',
        lastCheckedAt,
        details: {
          database: { status: 'healthy' },
          defillama: undefined,
          debank: undefined,
          hyperliquid: undefined,
          feargreed: undefined,
          'token-price': undefined,
        }
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.sources).toBeDefined();
    });

    it('should include source health when defined for a DataSource', async () => {
      const lastCheckedAt = new Date().toISOString();
      setHealthState({
        status: 'healthy',
        lastCheckedAt,
        details: {
          database: { status: 'healthy' },
          defillama: { status: 'healthy', details: 'OK', lastCheck: new Date().toISOString() },
        }
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.data.sources).toBeDefined();
      expect(response.body.data.sources.defillama).toBeDefined();
      expect(response.body.data.sources.defillama.status).toBe('healthy');
    });
  });
});
