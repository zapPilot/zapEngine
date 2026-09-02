import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import {
  FlyOpsHttpError,
  type FlyMachine,
  type FlyOpsClient,
} from './fly-client.js';
import { collectFlySignals } from './fly.js';
import { findRepoRoot } from './repo-root.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');
const CONFIG = readControlCenterConfig({});

function machine(
  state: string,
  region: string,
  processGroup: string | null = null,
): FlyMachine {
  return {
    id: `${region}-${processGroup ?? 'app'}-${state}`,
    name: null,
    state,
    region,
    processGroup,
    instanceId: null,
    createdAt: '2026-08-28T08:00:00.000Z',
    updatedAt: '2026-08-28T08:30:00.000Z',
    image: null,
    events: [],
  };
}

const HEALTHY_MACHINES: Record<string, FlyMachine[]> = {
  'account-engine': [machine('started', 'iad')],
  'alpha-etl': [machine('started', 'iad')],
  'analytics-engine-xws3ra': [machine('started', 'iad')],
  'from-fed-to-chain-api': [
    machine('started', 'iad', 'app'),
    machine('stopped', 'ord'),
    machine('stopped', 'iad', 'render'),
    machine('stopped', 'iad', 'render'),
  ],
};

function fleet(
  input: {
    machines?: Record<string, FlyMachine[]>;
    missingApps?: string[];
    error?: Error;
  } = {},
): FlyOpsClient {
  const machines = { ...HEALTHY_MACHINES, ...input.machines };
  return {
    async listMachines(app) {
      if (input.error) throw input.error;
      if (input.missingApps?.includes(app)) {
        throw new FlyOpsHttpError(`missing ${app}`, 404);
      }
      return machines[app] ?? [];
    },
  };
}

function collect(client: FlyOpsClient): Promise<OperationalSignal[]> {
  return collectFlySignals({ config: CONFIG, now: NOW, client });
}

function find(
  signals: readonly OperationalSignal[],
  fingerprint: string,
): OperationalSignal {
  const found = signals.find((signal) => signal.fingerprint === fingerprint);
  if (!found) throw new Error(`no signal fingerprinted ${fingerprint}`);
  return found;
}

describe('collectFlySignals', () => {
  it('reports one signal per expected app, split by process group', async () => {
    const signals = await collect(fleet());

    expect(signals.map((signal) => signal.fingerprint)).toEqual([
      'fly:app/account-engine',
      'fly:app/alpha-etl',
      'fly:app/analytics-engine-xws3ra',
      'fly:process-group/from-fed-to-chain-api/app',
      'fly:process-group/from-fed-to-chain-api/render',
    ]);
    expect(signals.every((signal) => signal.status === 'healthy')).toBe(true);
  });

  it('counts missing process-group metadata in the default app group', async () => {
    const signals = await collect(fleet());
    expect(
      find(signals, 'fly:process-group/from-fed-to-chain-api/app').evidence,
    ).toEqual({
      startedMachines: 1,
      stoppedMachines: 1,
      regions: 'iad,ord',
      criticalSinceMinutes: null,
    });
  });

  it('keeps a fully stopped render fleet healthy', async () => {
    const render = find(
      await collect(fleet()),
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(render.status).toBe('healthy');
    expect(render.evidence['startedMachines']).toBe(0);
  });

  it('reports a render group scaled to zero without calling it an outage', async () => {
    const signals = await collect(
      fleet({
        machines: {
          'from-fed-to-chain-api': [machine('started', 'iad', 'app')],
        },
      }),
    );
    const render = find(
      signals,
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(render.status).toBe('degraded');
    expect(render.evidence['stoppedMachines']).toBe(0);
  });

  it('flags a stopped always-on app group even while render runs', async () => {
    const signals = await collect(
      fleet({
        machines: {
          'from-fed-to-chain-api': [
            machine('stopped', 'iad', 'app'),
            machine('started', 'iad', 'render'),
          ],
        },
      }),
    );
    expect(
      find(signals, 'fly:process-group/from-fed-to-chain-api/app').status,
    ).toBe('critical');
  });

  it('scores an undeclared process group like an always-on service', async () => {
    const signals = await collect(
      fleet({
        machines: {
          'from-fed-to-chain-api': [
            machine('started', 'iad', 'app'),
            machine('stopped', 'iad', 'worker'),
          ],
        },
      }),
    );
    expect(
      find(signals, 'fly:process-group/from-fed-to-chain-api/worker').status,
    ).toBe('critical');
  });

  it('keeps a scale-to-zero app healthy while every Machine is stopped', async () => {
    const signals = await collect(
      fleet({
        machines: {
          'alpha-etl': [machine('stopped', 'iad'), machine('suspended', 'ord')],
        },
      }),
    );
    const etl = find(signals, 'fly:app/alpha-etl');
    expect(etl.status).toBe('healthy');
    expect(etl.detail).toContain('resting state');
  });

  it('flags a scale-to-zero app with nothing left to start', async () => {
    const etl = find(
      await collect(fleet({ machines: { 'alpha-etl': [] } })),
      'fly:app/alpha-etl',
    );
    expect(etl.status).toBe('critical');
    expect(etl.detail).toContain('Nothing is deployed here');
  });

  it('flags a 404 for an expected app as a missing app', async () => {
    const missing = find(
      await collect(fleet({ missingApps: ['account-engine'] })),
      'fly:app/account-engine',
    );
    expect(missing.status).toBe('critical');
    expect(missing.detail).toContain('404');
  });

  it('reports unknown when the read-only token is not configured', async () => {
    const signals = await collectFlySignals({ config: CONFIG, now: NOW });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('unknown');
    expect(signals[0]?.fingerprint).toBe('fly:unconfigured/token');
  });

  it('degrades the source when the Machines API fails', async () => {
    const signals = await collect(fleet({ error: new Error('Fly timed out') }));
    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.fingerprint).toBe('fly:source-failure/adapter');
  });
});

describe('fly lifecycle table', () => {
  const repoRoot = findRepoRoot(import.meta.dirname);

  function flyToml(directory: string): string {
    return readFileSync(join(repoRoot, 'apps', directory, 'fly.toml'), 'utf8');
  }

  function minMachinesRunning(toml: string): number[] {
    return [...toml.matchAll(/min_machines_running\s*=\s*(\d+)/g)].map(
      (match) => Number(match[1]),
    );
  }

  it.each([
    ['account-engine', 'account-engine'],
    ['alpha-etl', 'alpha-etl'],
    ['analytics-engine', 'analytics-engine-xws3ra'],
  ])(
    'declares %s as scale-to-zero because its fly.toml keeps no Machine running',
    (directory, appName) => {
      const toml = flyToml(directory);
      expect(toml).toContain(appName);
      const declared = minMachinesRunning(toml);
      expect(declared.length).toBeGreaterThan(0);
      expect(declared.every((value) => value === 0)).toBe(true);
      expect(toml).toContain('auto_start_machines = true');
    },
  );

  it('declares the podcast app group always-on and render on demand', () => {
    const toml = flyToml('podcast-pipeline');
    expect(toml).toContain("app = 'from-fed-to-chain-api'");
    expect(minMachinesRunning(toml)).toContain(1);
    expect(toml).toMatch(/\[processes\][\s\S]*render\s*=/);
    expect(toml).toMatch(/\[http_service\][\s\S]*processes = \['app'\]/);
  });
});
