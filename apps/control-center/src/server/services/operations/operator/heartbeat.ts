import type { OperationalSignal } from '../../../../shared/types.js';
import { buildSignal, errorMessage } from '../signal.js';
import type { OperatorStore } from './store.js';

const DEGRADED_AFTER_MS = 10 * 60 * 1000;
const CRITICAL_AFTER_MS = 15 * 60 * 1000;

const COMMON = {
  source: 'github-actions',
  domain: 'jobs',
  kind: 'workflow',
  key: 'ops-operator.yml',
} as const;

export async function collectOperatorHeartbeatSignal(
  store: OperatorStore,
  now: Date,
): Promise<OperationalSignal> {
  let heartbeat;
  try {
    heartbeat = await store.heartbeat();
  } catch (error) {
    return buildSignal({
      ...COMMON,
      status: 'unknown',
      title: 'ops-operator heartbeat unavailable',
      detail: errorMessage(error),
      evidence: {
        workflow: 'ops-operator.yml',
        heartbeatAt: null,
        heartbeatAgeMinutes: null,
      },
      observedAt: now,
    });
  }

  if (!heartbeat) {
    return buildSignal({
      ...COMMON,
      status: 'degraded',
      title: 'ops-operator has not recorded a heartbeat',
      detail:
        'No durable operator heartbeat exists yet; scheduled-run history is intentionally not used for self-monitoring.',
      evidence: {
        workflow: 'ops-operator.yml',
        heartbeatAt: null,
        heartbeatAgeMinutes: null,
      },
      observedAt: now,
    });
  }

  const heartbeatAt = Date.parse(heartbeat.observedAt);
  if (!Number.isFinite(heartbeatAt)) {
    return buildSignal({
      ...COMMON,
      status: 'unknown',
      title: 'ops-operator heartbeat is invalid',
      detail: `Stored heartbeat timestamp is not parseable: ${heartbeat.observedAt}`,
      evidence: {
        workflow: 'ops-operator.yml',
        heartbeatAt: heartbeat.observedAt,
        heartbeatAgeMinutes: null,
        actor: heartbeat.actor,
      },
      observedAt: now,
    });
  }

  const ageMs = Math.max(0, now.getTime() - heartbeatAt);
  const ageMinutes = Math.floor(ageMs / 60_000);
  const common = {
    ...COMMON,
    evidence: {
      workflow: 'ops-operator.yml',
      heartbeatAt: heartbeat.observedAt,
      heartbeatAgeMinutes: ageMinutes,
      actor: heartbeat.actor,
    },
    observedAt: now,
  };

  if (ageMs <= DEGRADED_AFTER_MS) {
    return buildSignal({
      ...common,
      status: 'healthy',
      title: 'ops-operator heartbeat is fresh',
      detail: `Latest operator cycle started ${ageMinutes}m ago.`,
    });
  }

  if (ageMs <= CRITICAL_AFTER_MS) {
    return buildSignal({
      ...common,
      status: 'degraded',
      title: 'ops-operator heartbeat is delayed',
      detail:
        `Latest operator heartbeat is ${ageMinutes}m old; the workflow is scheduled every 5 minutes.`,
    });
  }

  return buildSignal({
    ...common,
    status: 'critical',
    title: 'ops-operator heartbeat is stale',
    detail:
      `No operator heartbeat has been recorded for ${ageMinutes}m; the workflow is scheduled every 5 minutes.`,
  });
}
