import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import { collectFlySignals } from './fly.js';
import { findRepoRoot } from './repo-root.js';

const NOW = new Date('2026-08-28T09:00:00.000Z');

const ALL_APPS = [
  { Name: 'account-engine' },
  { Name: 'alpha-etl' },
  { Name: 'analytics-engine-xws3ra' },
  { Name: 'from-fed-to-chain-api' },
];

function machine(state: string, region: string, group?: string) {
  return {
    state,
    region,
    ...(group === undefined
      ? {}
      : { config: { metadata: { fly_process_group: group } } }),
  };
}

const HEALTHY_MACHINES: Record<string, unknown[]> = {
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

/**
 * A flyctl stand-in over the healthy fleet with only the rows a case is about
 * replaced. Every deviation here is a single app or a single listing entry, so
 * restating the whole fixture would bury the one line that carries the test.
 */
function fleet(
  overrides: { apps?: unknown[]; machines?: Record<string, unknown[]> } = {},
): (args: string[]) => Promise<string> {
  const apps = overrides.apps ?? ALL_APPS;
  const machines = { ...HEALTHY_MACHINES, ...overrides.machines };
  return (args) => {
    if (args[0] === 'apps') {
      return Promise.resolve(JSON.stringify(apps));
    }
    const app = args[args.indexOf('--app') + 1] ?? '';
    return Promise.resolve(JSON.stringify(machines[app] ?? []));
  };
}

function collect(
  run: (args: string[]) => Promise<string>,
): Promise<OperationalSignal[]> {
  return collectFlySignals({ now: NOW, run });
}

function find(
  signals: readonly OperationalSignal[],
  fingerprint: string,
): OperationalSignal {
  const found = signals.find((signal) => signal.fingerprint === fingerprint);
  if (!found) {
    throw new Error(`no signal fingerprinted ${fingerprint}`);
  }
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
    expect(signals.every((signal) => signal.domain === 'infra')).toBe(true);
    expect(signals[0]?.observedAt).toBe(NOW.toISOString());
  });

  it('counts a Machine without process-group metadata in the default group', async () => {
    const signals = await collect(fleet());

    expect(
      find(signals, 'fly:process-group/from-fed-to-chain-api/app').evidence,
    ).toEqual({
      startedMachines: 1,
      stoppedMachines: 1,
      regions: 'iad,ord',
    });
  });

  it('keeps a fully stopped render fleet healthy', async () => {
    const signals = await collect(fleet());

    const render = find(
      signals,
      'fly:process-group/from-fed-to-chain-api/render',
    );
    expect(render.status).toBe('healthy');
    expect(render.evidence).toEqual({
      startedMachines: 0,
      stoppedMachines: 2,
      regions: 'iad',
    });
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
    // `fly scale count render=0` is documented as the way to turn rendering
    // off, so an empty fleet is a deliberate state, not a failure.
    expect(render.status).toBe('degraded');
    expect(render.evidence).toEqual({
      startedMachines: 0,
      stoppedMachines: 0,
      regions: '',
    });
  });

  it('flags a stopped app group even while render Machines run', async () => {
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

    const api = find(signals, 'fly:process-group/from-fed-to-chain-api/app');
    expect(api.status).toBe('critical');
    expect(api.detail).toContain('meant to stay up');
    expect(
      find(signals, 'fly:process-group/from-fed-to-chain-api/render').status,
    ).toBe('healthy');
  });

  it('scores an undeclared process group like any other service', async () => {
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

    // Fly Proxy stops these apps when idle and starts them on the next
    // request. Scoring them on started count made the page permanently
    // critical while nothing was wrong, which is the one failure a status
    // page cannot survive.
    const etl = find(signals, 'fly:app/alpha-etl');
    expect(etl.status).toBe('healthy');
    expect(etl.detail).toContain('resting state');
    expect(etl.evidence).toEqual({
      startedMachines: 0,
      stoppedMachines: 2,
      regions: 'iad,ord',
    });
  });

  it('flags a scale-to-zero app with nothing left to start', async () => {
    const signals = await collect(fleet({ machines: { 'alpha-etl': [] } }));

    const etl = find(signals, 'fly:app/alpha-etl');
    expect(etl.status).toBe('critical');
    expect(etl.detail).toContain('Nothing is deployed here');
  });

  it('flags an expected app that flyctl no longer lists', async () => {
    const signals = await collect(
      fleet({ apps: ALL_APPS.filter((app) => app.Name !== 'account-engine') }),
    );

    const missing = find(signals, 'fly:app/account-engine');
    expect(missing.status).toBe('critical');
    expect(missing.evidence).toEqual({
      startedMachines: 0,
      stoppedMachines: 0,
      regions: '',
    });
  });

  it('drops unreadable rows instead of the whole response', async () => {
    const signals = await collect(
      fleet({
        apps: [...ALL_APPS, { Status: 'deployed' }],
        machines: {
          'alpha-etl': [machine('started', 'iad'), { region: 'ord' }],
        },
      }),
    );

    const etl = find(signals, 'fly:app/alpha-etl');
    expect(etl.status).toBe('healthy');
    expect(etl.evidence).toEqual({
      startedMachines: 1,
      stoppedMachines: 0,
      regions: 'iad',
    });
  });

  it('reports one unknown signal when flyctl is not installed', async () => {
    const enoent = Object.assign(new Error('spawn flyctl ENOENT'), {
      code: 'ENOENT',
    });
    const signals = await collect(() => Promise.reject(enoent));

    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('unknown');
    expect(signals[0]?.fingerprint).toBe('fly:unconfigured/flyctl');
  });

  it('treats a shell "command not found" as flyctl being absent', async () => {
    const signals = await collect(() =>
      Promise.reject(new Error('flyctl: command not found')),
    );

    expect(signals[0]?.status).toBe('unknown');
  });

  it('degrades when flyctl fails for any other reason', async () => {
    const signals = await collect(() =>
      Promise.reject(new Error('Error: no access token available')),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.fingerprint).toBe('fly:source-failure/adapter');
    expect(signals[0]?.detail).toBe('Error: no access token available');
  });

  it('degrades when flyctl emits output that is not JSON', async () => {
    const signals = await collect(() =>
      Promise.resolve('Update available 0.3.0 -> 0.3.1'),
    );

    expect(signals[0]?.status).toBe('degraded');
  });

  it('degrades when flyctl returns JSON that is not an array', async () => {
    const signals = await collect(() => Promise.resolve('{"apps":[]}'));

    expect(signals[0]?.detail).toBe(
      'flyctl returned JSON that is not an array',
    );
  });
});

/**
 * The lifecycle table in fly.ts restates what each app's own `fly.toml`
 * declares, and the cost of it drifting is not a broken test but a status page
 * that is permanently red — or, worse, permanently green over a fleet that
 * stopped staying up. This reads the deploy configuration and holds the table
 * to it, the same way the podcast pipeline pins `RENDER_MACHINE_SHAPE`.
 */
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
      expect(toml).toContain(`app = `);
      expect(toml).toContain(appName);
      const declared = minMachinesRunning(toml);
      expect(declared.length).toBeGreaterThan(0);
      expect(declared.every((value) => value === 0)).toBe(true);
      expect(toml).toContain('auto_start_machines = true');
    },
  );

  it('declares the podcast app group always-on and its render group on demand', () => {
    const toml = flyToml('podcast-pipeline');
    expect(minMachinesRunning(toml)).toContain(1);
    // The render group has no service at all, so Fly Proxy never starts it;
    // the capacity reconciler does, which is what `on-demand` names.
    expect(toml).toMatch(/\[processes\][\s\S]*render\s*=/);
    expect(toml).toMatch(/\[http_service\][\s\S]*processes = \['app'\]/);
  });
});
