import type { ControlCenterConfig } from '../../../config/env.js';
import {
  createFlyOpsClient,
  FlyOpsHttpError,
  type FlyMachine,
} from '../fly-client.js';
import type { ParsedOperationalFingerprint } from './fingerprint.js';
import type { SignalInspection } from './types.js';

const MACHINE_LIMIT = 5;
const EVENT_LIMIT = 8;
const DEFAULT_PROCESS_GROUP = 'app';

export async function inspectFlySignal(input: {
  config: ControlCenterConfig;
  fingerprint: string;
  parsed: ParsedOperationalFingerprint;
  inspectedAt: Date;
  fetchImpl: typeof fetch;
}): Promise<SignalInspection> {
  if (!['app', 'process-group'].includes(input.parsed.kind)) {
    return unsupported(
      input,
      `Fly inspection does not support ${input.parsed.kind} signals.`,
    );
  }

  const token = input.config.FLY_OPS_TOKEN;
  if (!token) {
    return {
      fingerprint: input.fingerprint,
      source: 'fly',
      status: 'unavailable',
      inspectedAt: input.inspectedAt.toISOString(),
      summary:
        'Fly deep inspection is unavailable because FLY_OPS_TOKEN is unset.',
      entities: [],
      evidence: {},
      gaps: [{ source: 'fly', reason: 'FLY_OPS_TOKEN is unset.' }],
    };
  }

  const target = parseTarget(input.parsed.kind, input.parsed.key);
  if (!target) {
    return unsupported(input, 'Fly process-group fingerprint has no app/group boundary.');
  }

  const client = createFlyOpsClient({ token, fetchImpl: input.fetchImpl });
  let machines: FlyMachine[];
  try {
    machines = await client.listMachines(target.app);
  } catch (error) {
    if (error instanceof FlyOpsHttpError && error.status === 404) {
      return {
        fingerprint: input.fingerprint,
        source: 'fly',
        status: 'not-found',
        inspectedAt: input.inspectedAt.toISOString(),
        summary: `Fly app ${target.app} was not found.`,
        entities: [{ type: 'fly-app', id: target.app }],
        evidence: { app: target.app, processGroup: target.processGroup },
        gaps: [],
      };
    }
    throw error;
  }

  const scoped = machines
    .filter(
      (machine) =>
        target.processGroup === null || processGroupOf(machine) === target.processGroup,
    )
    .sort((left, right) =>
      (right.updatedAt ?? right.createdAt ?? '').localeCompare(
        left.updatedAt ?? left.createdAt ?? '',
      ),
    )
    .slice(0, MACHINE_LIMIT);

  return {
    fingerprint: input.fingerprint,
    source: 'fly',
    status: 'ok',
    inspectedAt: input.inspectedAt.toISOString(),
    summary:
      target.processGroup === null
        ? `${target.app}: ${scoped.length} Machine${scoped.length === 1 ? '' : 's'} inspected.`
        : `${target.app}/${target.processGroup}: ${scoped.length} Machine${scoped.length === 1 ? '' : 's'} inspected.`,
    entities: [
      { type: 'fly-app', id: target.app, url: `https://fly.io/apps/${target.app}` },
      ...(target.processGroup
        ? [
            {
              type: 'fly-process-group' as const,
              id: `${target.app}/${target.processGroup}`,
            },
          ]
        : []),
      ...scoped.map((machine) => ({
        type: 'fly-machine' as const,
        id: machine.id,
      })),
    ],
    evidence: {
      app: target.app,
      processGroup: target.processGroup,
      totalMachines: machines.filter(
        (machine) =>
          target.processGroup === null ||
          processGroupOf(machine) === target.processGroup,
      ).length,
      machines: scoped.map(summarizeMachine),
    },
    gaps: [],
  };
}

function parseTarget(kind: string, key: string) {
  if (kind === 'app') {
    return { app: key, processGroup: null as string | null };
  }
  const boundary = key.lastIndexOf('/');
  if (boundary <= 0 || boundary === key.length - 1) return null;
  return {
    app: key.slice(0, boundary),
    processGroup: key.slice(boundary + 1),
  };
}

function summarizeMachine(machine: FlyMachine) {
  return {
    id: machine.id,
    name: machine.name,
    state: machine.state,
    region: machine.region,
    processGroup: processGroupOf(machine),
    instanceId: machine.instanceId,
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt,
    image: machine.image,
    recentEvents: machine.events.slice(0, EVENT_LIMIT),
  };
}

function processGroupOf(machine: FlyMachine): string {
  return machine.processGroup ?? DEFAULT_PROCESS_GROUP;
}

function unsupported(
  input: Parameters<typeof inspectFlySignal>[0],
  summary: string,
): SignalInspection {
  return {
    fingerprint: input.fingerprint,
    source: 'fly',
    status: 'unsupported',
    inspectedAt: input.inspectedAt.toISOString(),
    summary,
    entities: [],
    evidence: {},
    gaps: [],
  };
}
