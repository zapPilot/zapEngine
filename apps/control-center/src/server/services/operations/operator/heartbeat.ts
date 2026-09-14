import type { OperationalSignal } from '../../../../shared/types.js';
import { OPS_OPERATOR_CADENCE_MS } from '../schedule-interval.js';
import { buildSignal, errorMessage } from '../signal.js';
import type { OperatorStore } from './store.js';

// One missed firing is a slow scheduler; two is the schedule having stopped.
// Both derive from the cadence so retuning the cron cannot leave a window
// calibrated for a period the workflow no longer runs on.
const DEGRADED_AFTER_MS = 2 * OPS_OPERATOR_CADENCE_MS;
const CRITICAL_AFTER_MS = 3 * OPS_OPERATOR_CADENCE_MS;

// Interpolated rather than written out so the sentence an operator reads cannot
// contradict the thresholds it is explaining.
const CADENCE_SENTENCE = `the workflow is scheduled every ${OPS_OPERATOR_CADENCE_MS / 60_000} minutes`;

const COMMON = {
  source: 'github-actions',
  domain: 'jobs',
  kind: 'workflow',
  key: 'ops-operator.yml',
} as const;

function nullHeartbeatSignal(
  status: 'unknown' | 'degraded',
  title: string,
  detail: string,
  observedAt: Date,
): OperationalSignal {
  return buildSignal({
    ...COMMON,
    status,
    title,
    detail,
    evidence: {
      workflow: 'ops-operator.yml',
      heartbeatAt: null,
      heartbeatAgeMinutes: null,
    },
    observedAt,
  });
}

export async function collectOperatorHeartbeatSignal(
  store: OperatorStore,
  now: Date,
): Promise<OperationalSignal> {
  let heartbeat;
  try {
    heartbeat = await store.heartbeat();
  } catch (error) {
    return nullHeartbeatSignal(
      'unknown',
      'ops-operator heartbeat unavailable',
      errorMessage(error),
      now,
    );
  }

  if (!heartbeat) {
    return nullHeartbeatSignal(
      'degraded',
      'ops-operator has not recorded a heartbeat',
      'No durable operator heartbeat exists yet; scheduled-run history is intentionally not used for self-monitoring.',
      now,
    );
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
        state: heartbeat.state,
        failureStreak: heartbeat.failureStreak,
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
      state: heartbeat.state,
      failureStreak: heartbeat.failureStreak,
    },
    observedAt: now,
  };

  if (ageMs > CRITICAL_AFTER_MS) {
    return buildSignal({
      ...common,
      status: 'critical',
      title: 'ops-operator heartbeat is stale',
      detail: `No operator heartbeat update has been recorded for ${ageMinutes}m; ${CADENCE_SENTENCE}.`,
    });
  }

  if (heartbeat.failureStreak >= 2) {
    return buildSignal({
      ...common,
      status: 'critical',
      title: `ops-operator failed ${heartbeat.failureStreak} cycles in a row`,
      detail:
        heartbeat.state === 'running'
          ? `A new cycle started ${ageMinutes}m ago after ${heartbeat.failureStreak} consecutive failed cycles.`
          : `Latest operator cycle failed ${ageMinutes}m ago; ${heartbeat.failureStreak} consecutive cycles have failed.`,
    });
  }

  if (heartbeat.state === 'failed') {
    return buildSignal({
      ...common,
      status: 'degraded',
      title: 'ops-operator last cycle failed',
      detail: `Latest operator cycle failed ${ageMinutes}m ago.`,
    });
  }

  if (heartbeat.state === 'running' && heartbeat.failureStreak === 1) {
    return buildSignal({
      ...common,
      status: 'degraded',
      title: 'ops-operator is retrying after a failed cycle',
      detail: `A new cycle started ${ageMinutes}m ago after the previous cycle failed.`,
    });
  }

  if (ageMs > DEGRADED_AFTER_MS) {
    return buildSignal({
      ...common,
      status: 'degraded',
      title: 'ops-operator heartbeat is delayed',
      detail: `Latest operator heartbeat update is ${ageMinutes}m old; ${CADENCE_SENTENCE}.`,
    });
  }

  return buildSignal({
    ...common,
    status: 'healthy',
    title:
      heartbeat.state === 'running'
        ? 'ops-operator cycle is running'
        : 'ops-operator heartbeat is fresh',
    detail:
      heartbeat.state === 'running'
        ? `Current operator cycle started ${ageMinutes}m ago.`
        : `Latest operator cycle succeeded ${ageMinutes}m ago.`,
  });
}
