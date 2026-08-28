import { z } from 'zod';

import type { OperationalSignal } from '../../../shared/types.js';
import {
  buildSignal,
  collectOrFail,
  errorMessage,
  unknownSignal,
  type SignalOrigin,
} from './signal.js';
import { runFlyctl } from '../flyctl.js';

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
 * turns every idle minute into a fake outage, and a red mark that is up all
 * day is one nobody reads on the day it is real. What can still go wrong is
 * that there is nothing left to start, so that is what is scored instead.
 *
 * `on-demand` is the podcast render group: it stops itself with `exit(0)` on
 * an idle queue and is started again by the capacity reconciler. It differs
 * from the two above in what an empty fleet means — `fly scale count render=0`
 * is a documented way to turn rendering off, so no Machines is a deliberate
 * state worth reporting rather than an outage.
 */
type Lifecycle = 'always-on' | 'scale-to-zero' | 'on-demand';

interface ExpectedApp {
  name: string;
  /**
   * The whole app's lifecycle, or a per-process-group map where one app runs
   * fleets with different rules. Splitting elsewhere would just multiply
   * identical signals.
   */
  lifecycle: Lifecycle | Readonly<Record<string, Lifecycle>>;
}

/**
 * Enumerated rather than derived from `apps list`, because the failure this
 * adapter exists to catch includes an app that is no longer there. A set built
 * from the listing can never notice something missing from the listing.
 *
 * Each lifecycle here restates what that app's own `fly.toml` declares, and
 * `fly.test.ts` reads those files to prove the two still agree — the same
 * arrangement that keeps `RENDER_MACHINE_SHAPE` honest in the podcast pipeline.
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

const appSchema = z.object({ Name: z.string().min(1) });

/**
 * `state` is required while the rest is optional: a row whose state cannot be
 * read is dropped, and dropping only ever lowers the started count — an
 * unreadable row can make an app look worse, never healthier.
 */
const machineSchema = z.object({
  state: z.string().min(1),
  region: z.string().min(1).optional(),
  config: z
    .object({
      metadata: z
        .object({ fly_process_group: z.string().min(1).optional() })
        .optional(),
    })
    .optional(),
});

type FlyMachine = z.infer<typeof machineSchema>;

type Flyctl = (args: string[]) => Promise<string>;

export async function collectFlySignals(input: {
  now: Date;
  run?: Flyctl;
}): Promise<OperationalSignal[]> {
  const run = input.run ?? runFlyctl;
  return collectOrFail(ORIGIN, input.now, async () => {
    try {
      return await readFleet(run, input.now);
    } catch (error) {
      // Classified here rather than left to `collectOrFail`, because a host
      // without flyctl has to end up unknown instead of degraded.
      if (!isFlyctlMissing(error)) {
        throw error;
      }
      return [
        unknownSignal({
          ...ORIGIN,
          key: 'flyctl',
          title: 'Fly Machine health unavailable',
          detail:
            'flyctl is not on PATH here, so Machine state cannot be read.',
          observedAt: input.now,
        }),
      ];
    }
  });
}

async function readFleet(run: Flyctl, now: Date): Promise<OperationalSignal[]> {
  const listed = parseRows(await run(['apps', 'list', '--json']), appSchema);
  const present = new Set(listed.map((app) => app.Name));
  const perApp = await Promise.all(
    EXPECTED_APPS.map(async (expected) => {
      if (!present.has(expected.name)) {
        return [missingAppSignal(expected.name, now)];
      }
      const machines = parseRows(
        await run(['machine', 'list', '--app', expected.name, '--json']),
        machineSchema,
      );
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
    // A group Fly reports but the table does not name is scored as always-on:
    // an undeclared fleet is more likely a deploy that outgrew this list than
    // a new scale-to-zero one, and guessing the lenient way would hide it.
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
      'flyctl did not list this app: it was deleted, renamed, or now lives ' +
      'in another organization.',
    evidence: { startedMachines: 0, stoppedMachines: 0, regions: '' },
    observedAt: now,
    url: appUrl(app),
  });
}

/**
 * Suspended, failed and replacing Machines are counted as stopped: for
 * availability the only distinction that matters is whether something is
 * serving, and a sub-state breakdown here would just dilute that.
 */
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
  return machine.config?.metadata?.fly_process_group ?? DEFAULT_PROCESS_GROUP;
}

function appUrl(app: string): string {
  return `https://fly.io/apps/${app}`;
}

/**
 * The dashboard also runs on hosts that never install flyctl, where a missing
 * binary says nothing about Fly. Reporting that as a failure would leave a
 * permanent red mark that hides the day Fly is actually unreachable.
 */
function isFlyctlMissing(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    return true;
  }
  return errorMessage(error).includes('command not found');
}

function parseRows<T>(stdout: string, schema: z.ZodType<T>): T[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new Error('flyctl returned JSON that is not an array');
  }
  return parsed.flatMap((row) => {
    const result = schema.safeParse(row);
    return result.success ? [result.data] : [];
  });
}
