import { logger } from '../../utils/logger.js';

export interface HealthState {
  status: 'initializing' | 'healthy' | 'unhealthy';
  lastCheckedAt: string | null;
  message?: string;
}

let healthState: HealthState = {
  status: 'initializing',
  lastCheckedAt: null,
};

export function getHealthState(): HealthState {
  return healthState;
}

export function setHealthState(nextState: HealthState): void {
  healthState = nextState;
  logger.debug('Updated health state', nextState);
}
