import { TIMEOUTS } from '../../config/constants.js';
import { pingDatabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { getHealthState, setHealthState } from './healthStatus.js';

const DEFAULT_INTERVAL_MS = TIMEOUTS.HEALTH_CHECK_INTERVAL_MS;

async function runDatabaseCheck(): Promise<void> {
  const healthy = await pingDatabase();
  const status: 'healthy' | 'unhealthy' = healthy ? 'healthy' : 'unhealthy';
  const nextState = {
    status,
    lastCheckedAt: new Date().toISOString(),
    ...(!healthy && { message: 'Database ping failed' }),
  };

  if (!healthy) {
    logger.warn('Database ping failed, marking service unhealthy');
  } else if (getHealthState().status !== 'healthy') {
    logger.info('Database ping recovered, marking service healthy');
  }

  setHealthState(nextState);
}

export function startDatabaseHealthMonitor(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new RangeError('Health check interval must be a positive number');
  }

  void runDatabaseCheck();
  setInterval(() => {
    void runDatabaseCheck();
  }, intervalMs).unref();
}
