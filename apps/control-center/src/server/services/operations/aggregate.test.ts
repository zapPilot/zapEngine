import { describe, expect, it, vi } from 'vitest';

import type {
  CustomerEconomicsResponse,
  OperationalSignal,
  OperationalStatus,
  OperationsDomain,
  OperationsSocialResponse,
  OperationsSource,
} from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import {
  createOperationsService,
  type OperationsAdapters,
} from './aggregate.js';

const CONFIG = readControlCenterConfig({});
const NOW = new Date('2026-08-28T12:00:00.000Z');

function signal(
  source: OperationsSource,
  domain: OperationsDomain,
  status: OperationalStatus,
): OperationalSignal {
  return {
    fingerprint: `${source}:test/${domain}`,
    source,
    domain,
    status,
    title: `${source} ${status}`,
    detail: null,
    evidence: {},
    observedAt: NOW.toISOString(),
    url: null,
  };
}

const SOCIAL: OperationsSocialResponse = {
  generatedAt: NOW.toISOString(),
  daemon: {
    status: 'healthy',
    owner: 'laptop',
    daemonVersion: 'social-daemon-v1',
    firstStartedAt: NOW.toISOString(),
    lastTickStartedAt: NOW.toISOString(),
    lastTickCompletedAt: NOW.toISOString(),
    lastSuccessAt: NOW.toISOString(),
    lastError: null,
    staleMinutes: 0,
  },
  jobs: [],
  waitingMediaLanes: 0,
  invalidJobRows: 0,
  message: null,
};

const CUSTOMERS: CustomerEconomicsResponse = {
  generatedAt: NOW.toISOString(),
  status: 'ok',
  message: null,
  summary: {
    totalCustomers: 1,
    priorityUsers: 1,
    standardUsers: 0,
    pausedUsers: 0,
    activeLast7d: 1,
    inactiveButPriority: 0,
    aumUsd: 100,
    attributedCostUsd30d: 1,
    revenueUsd: null,
  },
  users: [],
};

function adapters(
  overrides: Partial<OperationsAdapters> = {},
): Partial<OperationsAdapters> {
  return {
    product: async () => [signal('product-health', 'product', 'healthy')],
    costs: async () => [signal('cost-ledger', 'costs', 'healthy')],
    github: async () => [signal('github-actions', 'jobs', 'healthy')],
    fly: async () => [signal('fly', 'infra', 'healthy')],
    sentry: async () => [signal('sentry', 'errors', 'healthy')],
    posthog: async () => [signal('posthog', 'analytics', 'unknown')],
    social: async () => ({
      response: SOCIAL,
      signals: [signal('social-queue', 'social', 'healthy')],
    }),
    customers: async () => ({
      response: CUSTOMERS,
      signals: [signal('customer-economics', 'customers', 'healthy')],
    }),
    ...overrides,
  };
}

function service(overrides: Partial<OperationsAdapters> = {}) {
  return createOperationsService({
    config: CONFIG,
    now: () => NOW,
    adapters: adapters(overrides),
  });
}

describe('createOperationsService', () => {
  it('always reports all eight domains', async () => {
    const response = await service({ fly: async () => [] }).getOperations();

    expect(response.domains.map((domain) => domain.domain)).toEqual([
      'customers',
      'product',
      'costs',
      'social',
      'jobs',
      'infra',
      'errors',
      'analytics',
    ]);
    // A domain nobody reported on is unknown, never healthy — an absent row
    // would read as a green light.
    const infra = response.domains.find((domain) => domain.domain === 'infra');
    expect(infra).toMatchObject({ status: 'unknown', signalCount: 0 });
  });

  it('rolls the worst known domain up to the overall status', async () => {
    const healthy = await service().getOperations();
    expect(healthy.status).toBe('healthy');

    const broken = await service({
      fly: async () => [signal('fly', 'infra', 'critical')],
    }).getOperations();
    expect(broken.status).toBe('critical');
  });

  it('turns an adapter that throws into a degraded source failure', async () => {
    const response = await service({
      sentry: async () => {
        throw new Error('sentry exploded');
      },
    }).getOperations();

    const failure = response.signals.find(
      (item) => item.fingerprint === 'sentry:source-failure/adapter',
    );
    expect(failure).toMatchObject({ status: 'degraded', domain: 'errors' });
    expect(failure?.detail).toBe('sentry exploded');
    // The rest of the snapshot still arrives.
    expect(response.signals.length).toBeGreaterThan(1);
  });

  it('sorts signals worst-first and ranks priorities', async () => {
    const response = await service({
      fly: async () => [signal('fly', 'infra', 'critical')],
      costs: async () => [signal('cost-ledger', 'costs', 'degraded')],
    }).getOperations();

    expect(response.signals.map((item) => item.status).slice(0, 2)).toEqual([
      'critical',
      'degraded',
    ]);
    expect(response.priorities[0]?.signal.domain).toBe('infra');
    expect(response.priorities).toHaveLength(2);
  });

  it('caches each source and only refetches when forced', async () => {
    const fly = vi.fn(async () => [signal('fly', 'infra', 'healthy')]);
    const instance = service({ fly });

    await instance.getOperations();
    await instance.getOperations();
    expect(fly).toHaveBeenCalledTimes(1);

    await instance.getOperations(true);
    expect(fly).toHaveBeenCalledTimes(2);
  });

  it('serves the social and customer payloads from the same cached load', async () => {
    const social = vi.fn(async () => ({
      response: SOCIAL,
      signals: [signal('social-queue', 'social', 'healthy')],
    }));
    const instance = service({ social });

    await instance.getOperations();
    await expect(instance.getSocial()).resolves.toBe(SOCIAL);
    expect(social).toHaveBeenCalledTimes(1);

    await expect(instance.getCustomers()).resolves.toBe(CUSTOMERS);
  });
});

it('refreshes every adapter only once during forced investigation', async () => {
  const social = vi.fn(async () => ({
    response: SOCIAL,
    signals: [signal('social-queue', 'social', 'healthy')],
  }));
  const customers = vi.fn(async () => ({ response: CUSTOMERS, signals: [] }));
  const service = createOperationsService({
    config: CONFIG,
    now: () => NOW,
    adapters: adapters({ social, customers }),
  });
  const result = await service.investigate(
    'social-queue:waiting-media/podcast',
    true,
  );
  expect(social).toHaveBeenCalledTimes(1);
  expect(customers).toHaveBeenCalledTimes(1);
  expect(result.correlation.basis).toBe('repository-topology');
});

it('blocks Sentry writes without durable verification and authorization', async () => {
  const service = createOperationsService({
    config: CONFIG,
    adapters: adapters(),
  });
  await expect(service.resolveSentryIssue('42', 'merged')).rejects.toThrow(
    'not configured',
  );
});

describe('operator-delegated resolution', () => {
  const delegatedConfig = readControlCenterConfig({
    SENTRY_OPS_WRITE_TOKEN: 'token',
    SENTRY_ORG_SLUG: 'zap-pilot',
  });

  function serviceReading(lastSeen: string) {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ id: '42', status: 'unresolved', lastSeen }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    return createOperationsService({
      config: delegatedConfig,
      adapters: adapters(),
    });
  }

  it('refuses to close an issue that is still firing', async () => {
    const service = serviceReading(new Date(Date.now() - 60_000).toISOString());

    await expect(
      service.resolveSentryIssue('42', 'dead history', 'taii'),
    ).rejects.toThrow('requires 24 hours without an event');
  });

  it('reaches the delegated rail once the issue has gone quiet', async () => {
    const service = serviceReading(
      new Date(Date.now() - 72 * 3_600_000).toISOString(),
    );

    // Persistence is unconfigured here, so getting as far as the claim is what
    // proves the quiet gate passed and the delegated rail was selected.
    await expect(
      service.resolveSentryIssue('42', 'dead history', 'taii'),
    ).rejects.toThrow('Operator persistence is not configured');
  });
});
