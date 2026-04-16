import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getHealthState, setHealthState, resetHealthState, type HealthState } from '../../../src/modules/core/healthStatus.js';

// Mock logger to prevent console noise during tests
vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

describe('HealthStatus', () => {
  beforeEach(() => {
    // Reset health state before each test
    resetHealthState();
  });

  describe('getHealthState', () => {
    it('returns initial state as initializing', () => {
      const state = getHealthState();

      expect(state).toEqual({
        status: 'initializing',
        lastCheckedAt: null
      });
    });

    it('returns the current health state object', () => {
      const state = getHealthState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastCheckedAt');
    });
  });

  describe('setHealthState', () => {
    it('updates health state to healthy', () => {
      const newState: HealthState = {
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      };

      setHealthState(newState);
      const currentState = getHealthState();

      expect(currentState).toEqual(newState);
      expect(currentState.status).toBe('healthy');
    });

    it('updates health state to unhealthy with message', () => {
      const newState: HealthState = {
        status: 'unhealthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z',
        message: 'Database connection failed'
      };

      setHealthState(newState);
      const currentState = getHealthState();

      expect(currentState).toEqual(newState);
      expect(currentState.status).toBe('unhealthy');
      expect(currentState.message).toBe('Database connection failed');
    });

    it('allows transition from initializing to healthy', () => {
      expect(getHealthState().status).toBe('initializing');

      setHealthState({
        status: 'healthy',
        lastCheckedAt: new Date().toISOString()
      });

      expect(getHealthState().status).toBe('healthy');
    });

    it('allows transition from healthy to unhealthy', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      });

      setHealthState({
        status: 'unhealthy',
        lastCheckedAt: '2024-01-15T10:05:00.000Z',
        message: 'Service degraded'
      });

      const state = getHealthState();
      expect(state.status).toBe('unhealthy');
      expect(state.message).toBe('Service degraded');
    });

    it('allows transition from unhealthy back to healthy', () => {
      setHealthState({
        status: 'unhealthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z',
        message: 'Error occurred'
      });

      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:10:00.000Z'
      });

      const state = getHealthState();
      expect(state.status).toBe('healthy');
      expect(state.message).toBeUndefined();
    });

    it('updates lastCheckedAt timestamp', () => {
      const timestamp1 = '2024-01-15T10:00:00.000Z';
      const timestamp2 = '2024-01-15T10:05:00.000Z';

      setHealthState({
        status: 'healthy',
        lastCheckedAt: timestamp1
      });
      expect(getHealthState().lastCheckedAt).toBe(timestamp1);

      setHealthState({
        status: 'healthy',
        lastCheckedAt: timestamp2
      });
      expect(getHealthState().lastCheckedAt).toBe(timestamp2);
    });

    it('clears message when transitioning to healthy without message', () => {
      setHealthState({
        status: 'unhealthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z',
        message: 'Database error'
      });

      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:05:00.000Z'
      });

      expect(getHealthState().message).toBeUndefined();
    });
  });

  describe('resetHealthState', () => {
    it('resets state to initializing', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      });

      resetHealthState();

      expect(getHealthState()).toEqual({
        status: 'initializing',
        lastCheckedAt: null
      });
    });

    it('clears lastCheckedAt timestamp', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      });

      resetHealthState();

      expect(getHealthState().lastCheckedAt).toBeNull();
    });

    it('clears any error messages', () => {
      setHealthState({
        status: 'unhealthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z',
        message: 'Critical error'
      });

      resetHealthState();

      const state = getHealthState();
      expect(state.message).toBeUndefined();
      expect(state.status).toBe('initializing');
    });

    it('can be called multiple times safely', () => {
      resetHealthState();
      resetHealthState();
      resetHealthState();

      expect(getHealthState()).toEqual({
        status: 'initializing',
        lastCheckedAt: null
      });
    });
  });

  describe('State persistence', () => {
    it('maintains state across multiple get calls', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      });

      const state1 = getHealthState();
      const state2 = getHealthState();
      const state3 = getHealthState();

      expect(state1).toEqual(state2);
      expect(state2).toEqual(state3);
    });

    it('reflects updates immediately', () => {
      const timestamp = '2024-01-15T10:00:00.000Z';

      setHealthState({
        status: 'unhealthy',
        lastCheckedAt: timestamp,
        message: 'Test error'
      });

      const state = getHealthState();
      expect(state.status).toBe('unhealthy');
      expect(state.lastCheckedAt).toBe(timestamp);
      expect(state.message).toBe('Test error');
    });
  });

  describe('Edge cases', () => {
    it('handles rapid state transitions', () => {
      for (let i = 0; i < 100; i++) {
        setHealthState({
          status: i % 2 === 0 ? 'healthy' : 'unhealthy',
          lastCheckedAt: new Date().toISOString()
        });
      }

      // Should end on unhealthy (99 is odd)
      expect(getHealthState().status).toBe('unhealthy');
    });

    it('handles missing optional message field', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z'
      });

      expect(getHealthState().message).toBeUndefined();
    });

    it('handles message set to undefined', () => {
      setHealthState({
        status: 'healthy',
        lastCheckedAt: '2024-01-15T10:00:00.000Z',
        message: undefined
      });

      // Even when explicitly set to undefined, the property exists
      const state = getHealthState();
      expect(state.status).toBe('healthy');
      // Message will be undefined (property exists but value is undefined)
      expect(state.message).toBeUndefined();
    });
  });
});
