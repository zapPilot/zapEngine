import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OperationsResponse, OperationalSignal } from '../shared/types.js';
import type { Statement } from '../shared/statements.js';

const state = vi.hoisted(() => ({
  config: { SERVICE: 'test' },
  snapshot: null as unknown as OperationsResponse,
  statements: [] as Statement[],
  operationsForce: null as unknown,
  statementsForce: null as unknown,
  statementsInput: null as unknown,
}));

vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));
vi.mock('./services/overview.js', () => ({
  createOverviewService: () => ({ marker: 'overview' }),
}));
vi.mock('./services/podcast-costs.js', () => ({
  createPodcastCostService: () => ({ marker: 'podcast-costs' }),
}));
vi.mock('./services/podcast-pipeline.js', () => ({
  createPodcastPipelineService: () => ({ marker: 'podcast-pipeline' }),
}));
vi.mock('./services/social-growth.js', () => ({
  createSocialGrowthService: () => ({ marker: 'social-growth' }),
}));
vi.mock('./services/operations/aggregate.js', () => ({
  createOperationsService: () => ({
    getOperations: (force: unknown) => {
      state.operationsForce = force;
      return Promise.resolve(state.snapshot);
    },
  }),
}));
vi.mock('./services/statements/index.js', () => ({
  createStatementsService: (input: unknown) => {
    state.statementsInput = input;
    return {
      getStatements: (force: unknown) => {
        state.statementsForce = force;
        return Promise.resolve({ statements: state.statements });
      },
    };
  },
}));

function domain(
  domainName: OperationsResponse['domains'][number]['domain'],
  status: OperationsResponse['status'],
  signalCount = 1,
) {
  return { domain: domainName, status, signalCount };
}

function signal(overrides: Partial<OperationalSignal> = {}): OperationalSignal {
  return {
    fingerprint: 'test:signal/1',
    source: 'sentry',
    domain: 'errors',
    status: 'critical',
    title: 'Test signal',
    detail: null,
    evidence: {},
    observedAt: '2026-09-10T00:00:00.000Z',
    url: null,
    ...overrides,
  };
}

function statement(overrides: Partial<Statement> = {}): Statement {
  return {
    domain: 'reliability',
    status: 'healthy',
    score: 10,
    sentence: [{ text: 'All is well' }],
    kicker: 'kicker',
    series: [1],
    value: '1',
    delta: '+0',
    deltaTone: 'neutral',
    evidenceRef: 'panel',
    url: null,
    ...overrides,
  };
}

function healthySnapshot(
  overrides: Partial<OperationsResponse> = {},
): OperationsResponse {
  return {
    generatedAt: '2026-09-10T00:00:00.000Z',
    status: 'healthy',
    domains: [
      domain('customers', 'healthy', 0),
      domain('product', 'healthy', 0),
      domain('costs', 'healthy', 0),
      domain('social', 'healthy', 0),
      domain('jobs', 'healthy', 0),
      domain('infra', 'healthy', 0),
      domain('errors', 'healthy', 0),
      domain('analytics', 'healthy', 0),
    ],
    priorities: [],
    signals: [],
    ...overrides,
  };
}

let argvBackup: string[];
let exitCodeBackup: typeof process.exitCode;
let writeBackup: typeof process.stdout.write;
let writeCalls: string[];

beforeEach(() => {
  vi.resetModules();
  argvBackup = [...process.argv];
  exitCodeBackup = process.exitCode;
  process.exitCode = undefined;
  writeBackup = process.stdout.write;
  writeCalls = [];
  process.stdout.write = ((chunk: unknown) => {
    writeCalls.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  state.snapshot = healthySnapshot();
  state.statements = [];
  state.operationsForce = null;
  state.statementsForce = null;
  state.statementsInput = null;
});

afterEach(() => {
  process.argv = argvBackup;
  process.exitCode = exitCodeBackup;
  process.stdout.write = writeBackup;
  vi.restoreAllMocks();
});

function output() {
  return writeCalls.join('');
}

describe('ops:status entrypoint', () => {
  it('renders machine JSON and exits 1 when critical', async () => {
    state.snapshot = healthySnapshot({
      status: 'critical',
      priorities: [
        {
          signal: signal({ fingerprint: 'sentry:issues/1' }),
          score: 99,
          reasons: ['critical'],
        },
      ],
    });
    state.statements = [statement()];
    process.argv = ['node', 'ops-status-cli.ts', '--json'];

    await import('./ops-status-cli.js');

    const parsed = JSON.parse(output());
    expect(parsed.status).toBe('critical');
    expect(parsed.statements).toHaveLength(1);
    expect(process.exitCode).toBe(1);
    expect(state.operationsForce).toBe(false);
    expect(state.statementsForce).toBe(false);
  });

  it('renders human output with the idle line when nothing is actionable', async () => {
    state.snapshot = healthySnapshot();
    state.statements = [];
    process.argv = ['node', 'ops-status-cli.ts'];

    await import('./ops-status-cli.js');

    expect(output()).toContain('Nothing above the action threshold.');
    expect(output()).toContain('● OVERALL HEALTHY');
    expect(process.exitCode).toBeUndefined();
  });

  it('forwards --force to both read models', async () => {
    state.snapshot = healthySnapshot();
    process.argv = ['node', 'ops-status-cli.ts', '--json', '--force'];

    await import('./ops-status-cli.js');

    expect(state.operationsForce).toBe(true);
    expect(state.statementsForce).toBe(true);
    expect(JSON.parse(output()).status).toBe('healthy');
  });

  it('renders priorities with and without detail and url', async () => {
    state.snapshot = healthySnapshot({
      status: 'degraded',
      domains: [
        domain('customers', 'degraded'),
        domain('product', 'unknown'),
        domain('costs', 'healthy'),
        domain('social', 'critical'),
        domain('jobs', 'healthy', 0),
        domain('infra', 'healthy', 0),
        domain('errors', 'healthy', 0),
        domain('analytics', 'healthy', 0),
      ],
      priorities: [
        {
          signal: signal({
            fingerprint: 'github-actions:workflow/ci.yml',
            status: 'critical',
            title: 'CI failed',
            detail: 'Two runs failed',
            url: 'https://github.com/zapPilot/zapEngine/actions',
          }),
          score: 90,
          reasons: ['critical', 'streak'],
        },
        {
          signal: signal({
            fingerprint: 'sentry:issues/2',
            status: 'degraded',
            title: 'Degraded checkout',
            detail: null,
            url: null,
          }),
          score: 40,
          reasons: ['degraded'],
        },
      ],
    });
    state.statements = [
      statement({
        status: 'critical',
        domain: 'reliability',
        sentence: [{ text: 'Spend is ' }, { value: '$12', tone: 'error' }],
        value: '$12',
        delta: '+1',
        kicker: 'today',
      }),
      statement({
        status: 'degraded',
        domain: 'product',
        sentence: [{ text: 'Wallets lag' }],
        value: '3',
        delta: '-1',
        kicker: 'freshness',
      }),
      statement({
        status: 'unknown',
        domain: 'growth',
        sentence: [{ value: 'n/a', tone: 'neutral' }],
        value: 'n/a',
        delta: '—',
        kicker: 'analytics',
      }),
    ];
    process.argv = ['node', 'ops-status-cli.ts'];

    await import('./ops-status-cli.js');

    const text = output();
    expect(text).toContain('Do this first:');
    expect(text).toContain('Two runs failed');
    expect(text).toContain('https://github.com/zapPilot/zapEngine/actions');
    expect(text).toContain('✖');
    expect(text).toContain('▲');
    expect(text).toContain('●');
    expect(text).toContain('○');
    expect(text).toContain('Spend is $12');
    expect(text).toContain('Statements:');
    expect(process.exitCode).toBeUndefined();
  });
});
