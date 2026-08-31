import type { OperationalSignal } from '../../../shared/types.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  createFlyOpsClient,
  FlyOpsHttpError,
  type FlyMachine,
  type FlyOpsClient,
} from './fly-client.js';
import {
  buildSignal,
  collectOrFail,
  unknownSignal,
  type SignalOrigin,
} from './signal.js';

const ORIGIN: SignalOrigin = { source: 'fly', domain: 'infra' };

/**
 * Fly stamps `fly_process_group` only on Machines created by a deploy that
 * declares process groups; everything else belongs to the implicit group Fly
 * itself names `app`. Treating absent metadata as an unknown group would give
 * every single-process app a second, permanently empty group to report on.
 */
const DEFAULT_PROCESS_GROUP = 'app';

/**
 * What a stopped Machine means here, which is not the same thing everywhere.
 *
 * `always-on` fleets are the ones something else depends on being up right
 * now: nothing stops them on purpose, so zero started Machines is an outage.
 *
 * `scale-to-zero` fleets are request-driven services that Fly Proxy stops
 * when idle and starts again on the next request (`auto_stop_machines =
 * 'stop'` with `min_machines_running = 0`). Scoring those on started count
 * turns every idle minute into a fake outage. What can still go wrong is that
 * there is nothing left to start, so that is what is scored instead.
 *
 * `on-demand` is the podcast render group: it stops itself with `exit(0)` on
 * an idle queue and is started again by the capacity reconciler. No Machines
 * in that group is a deliberate scaled-to-zero state worth reporting rather
 * than an outage.
 */
type Lifecycle = 'always-on' | 'scale-to-zero' | 'on-demand';

interface ExpectedApp {
  name: string;
  lifecycle: Lifecycle | Readonly<Record<string, Lifecycle>>;
}

/**
 * Enumerated rather than discovered from Fly because the condition this
 * adapter must catch includes an app that no longer exists. The lifecycle
 * values restate each app's fly.toml and are drift-tested in fly.test.ts.
 */
const EXPECTED_APPS: readonly ExpectedApp[] = [
  { name: 'account-engine', lifecycle: 'scale-to-zero' },
  { name: 'alpha-etl', lifecycle: 'scale-to-zero' },
  { name: 'analytics-engine-xws3ra', lifecycle: 'scale-to-zero' },
  {
    name: 'from-fed-to-chain-api',
    lifecycle: { app: 'always-on', render: 'on-demand' },
  },
];

export async function collectFlySignals(input: {
  config: ControlCenterConfig;
  now: Date;
  client?: FlyOpsClient;
}): Promise<OperationalSignal[]> {
  const token = input.config.FLY_OPS_TOKEN;
  if (!input.client && !token) {
    return [
      unknownSignal({
        ...ORIGIN,
        key: 'token',
        title: 'Fly Machine health not configured',
        detail:
          'FLY_OPS_TOKEN is unset, so Machine state cannot be read from the Fly Machines API.',
        observedAt: input.now,
      }),
    ];
  }

  const client = input.client ?? createFlyOpsClient({ token: token! });
  return collectOrFail(ORIGIN, input.now, () => readFleet(client, input.now));
}

async function readFleet(
  client: FlyOpsClient,
  now: Date,
): Promise<OperationalSignal[]> {
  const perApp = await Promise.all(
    EXPECTED_APPS.map(async (expected) => {
      let machines: FlyMachine[];
      try {
        machines = await client.listMachines(expected.name);
      } catch (error) {
        if (error instanceof FlyOpsHttpError && error.status === 404) {
          return [missingAppSignal(expected.name, now)];
        }
        throw error;
      }

      if (typeof expected.lifecycle === 'string') {
        return [appSignal(expected.name, expected.lifecycle, machines, now)];
      }
      return processGroupSignals(
        expected.name,
        expected.lifecycle,
        machines,
        now,
      );
    }),
  );
  return perApp.flat();
}

function appSignal(
  app: string,
  lifecycle: Lifecycle,
  machines: readonly FlyMachine[],
  now: Date,
): OperationalSignal {
  const verdict = judgeFleet(lifecycle, machines);
  return buildSignal({
    ...ORIGIN,
    kind: 'app',
    key: app,
    status: verdict.status,
    title: `${app} ${verdict.summary}`,
    detail: verdict.detail,
    evidence: evidenceFor(machines, verdict.started),
    observedAt: now,
    url: appUrl(app),
  });
}

function processGroupSignals(
  app: string,
  lifecycles: Readonly<Record<string, Lifecycle>>,
  machines: readonly FlyMachine[],
  now: Date,
): OperationalSignal[] {
  const groups = [
    ...new Set([...Object.keys(lifecycles), ...machines.map(processGroupOf)]),
  ].sort();
  return groups.map((group) => {
    const rows = machines.filter(
      (machine) => processGroupOf(machine) === group,
    );
    const verdict = judgeFleet(lifecycles[group] ?? 'always-on', rows);
    return buildSignal({
      ...ORIGIN,
      kind: 'process-group',
      key: `${app}/${group}`,
      status: verdict.status,
      title: `${app} ${group} ${verdict.summary}`,
      detail: verdict.detail,
      evidence: evidenceFor(rows, verdict.started),
      observedAt: now,
      url: appUrl(app),
    });
  });
}

interface FleetVerdict {
  status: 'healthy' | 'degraded' | 'critical';
  summary: string;
  detail: string | null;
  started: number;
}

function judgeFleet(
  lifecycle: Lifecycle,
  machines: readonly FlyMachine[],
): FleetVerdict {
  const started = machines.filter(isStarted).length;
  if (machines.length === 0) {
    return lifecycle === 'on-demand'
      ? {
          status: 'degraded',
          summary: 'has been scaled to zero',
          detail:
            'No Machines exist here, so nothing can be started on demand. ' +
            '`fly scale count` is a supported way to turn this fleet off, so ' +
            'this is reported rather than treated as an outage.',
          started,
        }
      : {
          status: 'critical',
          summary: 'has no Machines at all',
          detail:
            'Nothing is deployed here, so no request can be served and ' +
            'nothing can be started.',
          started,
        };
  }
  if (lifecycle === 'always-on' && started === 0) {
    return {
      status: 'critical',
      summary: 'has no started Machine',
      detail: `Every Machine here is stopped (${machines.length} total), and this fleet is meant to stay up.`,
      started,
    };
  }
  if (started === 0) {
    return {
      status: 'healthy',
      summary: 'is at rest',
      detail: `All ${machines.length} Machines are stopped, which is this fleet's resting state — Fly starts one on the next request or job.`,
      started,
    };
  }
  return { status: 'healthy', summary: 'is serving', detail: null, started };
}

function missingAppSignal(app: string, now: Date): OperationalSignal {
  return buildSignal({
    ...ORIGIN,
    kind: 'app',
    key: app,
    status: 'critical',
    title: `${app} is missing from Fly`,
    detail:
      'The Fly Machines API returned 404 for this expected app: it was deleted, renamed, or now lives in another organization.',
    evidence: { startedMachines: 0, stoppedMachines: 0, regions: '' },
    observedAt: now,
    url: appUrl(app),
  });
}

function evidenceFor(
  machines: readonly FlyMachine[],
  started: number,
): OperationalSignal['evidence'] {
  const regions = machines.flatMap((machine) =>
    machine.region ? [machine.region] : [],
  );
  return {
    startedMachines: started,
    stoppedMachines: machines.length - started,
    regions: [...new Set(regions)].sort().join(','),
  };
}

function isStarted(machine: FlyMachine): boolean {
  return machine.state === 'started';
}

function processGroupOf(machine: FlyMachine): string {
  return machine.processGroup ?? DEFAULT_PROCESS_GROUP;
}

function appUrl(app: string): string {
  return `https://fly.io/apps/${app}`;
}
