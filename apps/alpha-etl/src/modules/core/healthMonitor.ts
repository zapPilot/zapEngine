import { pingDatabase, TIMEOUTS } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { getHealthState, setHealthState } from './healthStatus.js';

const DEFAULT_INTERVAL_MS = TIMEOUTS.HEALTH_CHECK_INTERVAL_MS;

async function runDatabaseCheck(): Promise<void> {
  const healthy = await pingDatabase();
  const status: 'healthy' | 'unhealthy' = healthy ? 'healthy' : 'unhealthy';
  const nextState = {
    status,
    lastCheckedAt: new Date().toISOString(),
    message: healthy ? undefined : 'Database ping failed'
  };

  if (!healthy) {
    logger.warn('Database ping failed, marking service unhealthy');
  } else if (getHealthState().status !== 'healthy') {
    logger.info('Database ping recovered, marking service healthy');
  }

  setHealthState(nextState);
}

export function startDatabaseHealthMonitor(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  void runDatabaseCheck();
  setInterval(() => {
    void runDatabaseCheck();
  }, intervalMs).unref();
}
