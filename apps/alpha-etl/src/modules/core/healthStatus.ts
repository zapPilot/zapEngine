import { logger } from '../../utils/logger.js';

/** Health status for a single source or service */
export interface HealthDetailStatus {
  status: 'healthy' | 'unhealthy';
  details?: string;
  lastCheck?: string;
}

export interface HealthState {
  status: 'initializing' | 'healthy' | 'unhealthy';
  lastCheckedAt: string | null;
  message?: string;
  details?: {
    database?: HealthDetailStatus;
    [source: string]: HealthDetailStatus | undefined;
  };
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

export function resetHealthState(): void {
  healthState = { status: 'initializing', lastCheckedAt: null };
  logger.debug('Health state reset to initializing');
}
