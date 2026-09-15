import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OperationalSignal } from '../../../shared/types.js';
import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { readControlCenterConfig } from '../../config/env.js';
import { createOperationsService } from './aggregate.js';

const fakeClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => fakeClient.current,
  };
});

const supabaseFake = vi.hoisted(() => ({
  current: null as unknown as (...args: unknown[]) => unknown,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => supabaseFake.current(...args),
}));

function emptySupabaseClient() {
  const query: Record<string, (...args: never[]) => unknown> = {};
  const chain = () => query;
  query['select'] = chain;
  query['in'] = chain;
  query['limit'] = chain;
  query['eq'] = chain;
  query['order'] = chain;
  query['maybeSingle'] = async () => ({ data: null, error: null });
  query['then'] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return { from: () => query };
}

function rpcClient(impl: (name: string) => { data: unknown; error: unknown }) {
  const rpc = vi.fn((name: string, args?: unknown) => {
    void args;
    return {
      abortSignal: vi.fn().mockResolvedValue(impl(name)),
    };
  });
  return { rpc, client: { rpc } };
}

const NOW = new Date('2026-09-10T00:00:00.000Z');

function healthy(
  fingerprint: string,
  source: OperationalSignal['source'] = 'sentry',
  domain: OperationalSignal['domain'] = 'errors',
): OperationalSignal {
  return {
    fingerprint,
    source,
    domain,
    status: 'healthy',
    title: fingerprint,
    detail: null,
    evidence: {},
    observedAt: NOW.toISOString(),
    url: null,
  };
}

afterEach(() => {
  fakeClient.current = null;
  vi.unstubAllGlobals();
});

describe('operations service branches', () => {
  it('builds every domain from default adapters without credentials', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
    });
    const response = await service.getOperations();

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
  });

  it('defaults to wall-clock time when no clock is injected', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
    });
    const response = await service.getOperations();

    expect(response.domains).toHaveLength(8);
    expect(Date.parse(response.generatedAt)).not.toBeNaN();
  });

  it('sorts same-severity signals by fingerprint', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      adapters: {
        sentry: async () => [
          healthy('sentry:test/bbb'),
          healthy('sentry:test/aaa'),
        ],
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        posthog: async () => [],
        social: async () => ({
          response: await serviceSocialResponse(),
          signals: [],
        }),
        customers: async () => ({
          response: await serviceCustomersResponse(service),
          signals: [],
        }),
      },
    });
    const response = await service.getOperations();
    const ordered = response.signals
      .filter((item) => item.fingerprint.startsWith('sentry:test/'))
      .map((item) => item.fingerprint);

    expect(ordered).toEqual(['sentry:test/aaa', 'sentry:test/bbb']);
  });

  it('routes render fingerprints to the exact render inspector', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
        social: async () => ({
          response: await serviceSocialResponse(),
          signals: [],
        }),
        customers: async () => ({
          response: await serviceCustomersResponse(service),
          signals: [],
        }),
      },
    });

    await expect(
      service.inspectSignal(
        'social-queue:render/22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow('not configured');
  });

  it('loads customer economics when investigating freshness impact', async () => {
    const customers = vi.fn(async () => ({
      response: await serviceCustomersResponse(null as never),
      signals: [],
    }));
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
        social: async () => ({
          response: await serviceSocialResponse(),
          signals: [],
        }),
        customers,
      },
    });

    const result = await service.investigate('sentry:issues/alpha-etl');

    expect(customers).toHaveBeenCalled();
    expect(result.relatedEvidence.customers).toMatchObject({
      totalCustomers: 0,
    });
  });

  it('delegates non-render fingerprints to the provider inspector', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
        social: async () => ({
          response: await serviceSocialResponse(),
          signals: [],
        }),
        customers: async () => ({
          response: await serviceCustomersResponse(service),
          signals: [],
        }),
      },
    });
    const result = await service.inspectSignal('posthog:events/product');

    expect(result.status).toBe('unsupported');
  });

  it('serves social and customer payloads from cache', async () => {
    const service = createOperationsService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
        social: async () => ({
          response: await serviceSocialResponse(),
          signals: [],
        }),
        customers: async () => ({
          response: await serviceCustomersResponse(service),
          signals: [],
        }),
      },
    });

    await expect(service.getSocial()).resolves.toMatchObject({
      generatedAt: NOW.toISOString(),
    });
    await expect(service.getCustomers()).resolves.toMatchObject({
      generatedAt: NOW.toISOString(),
    });
  });
});

describe('sentry resolution rails', () => {
  const config = readControlCenterConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    SENTRY_OPS_WRITE_TOKEN: 'write-token',
    SENTRY_ORG_SLUG: 'zap-pilot',
  });

  function serviceWith(
    fetchImpl: typeof fetch,
    rpcImpl: (name: string) => { data: unknown; error: unknown },
  ) {
    const { rpc, client } = rpcClient(rpcImpl);
    fakeClient.current = client;
    vi.stubGlobal('fetch', fetchImpl);
    const service = createOperationsService({
      config,
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
        social: async () => ({ response: null as never, signals: [] }),
        customers: async () => ({ response: null as never, signals: [] }),
      },
    });
    return { service, rpc };
  }

  function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
    });
  }

  it('resolves on the verified-fix rail and finishes the attempt', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: '42', status: 'resolved' }));
    const { service, rpc } = serviceWith(fetchImpl, () => ({
      data: 'attempt-1',
      error: null,
    }));

    const result = await service.resolveSentryIssue('42', 'Fix is deployed.');

    expect(result).toMatchObject({ issueId: '42', status: 'resolved' });
    expect(rpc).toHaveBeenCalledWith(
      'ops_finish_resolution',
      expect.objectContaining({ p_state: 'succeeded' }),
    );
  });

  it('reconciles when the provider result is ambiguous', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: '42', status: 'unresolved' }));
    const { service, rpc } = serviceWith(fetchImpl, () => ({
      data: 'attempt-1',
      error: null,
    }));

    await expect(
      service.resolveSentryIssue('42', 'Fix is deployed.'),
    ).rejects.toThrow('did not return the issue as resolved');
    expect(rpc).toHaveBeenCalledWith(
      'ops_finish_resolution',
      expect.objectContaining({
        p_state: 'unknown',
        p_result: {
          message:
            'Provider result requires reconciliation; do not repeat the mutation.',
        },
      }),
    );
  });

  it('proves quietness before a delegated resolution', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        if ((init as RequestInit | undefined)?.method === 'PUT') {
          return jsonResponse({ id: '42', status: 'resolved' });
        }
        return jsonResponse({
          id: '42',
          status: 'unresolved',
          lastSeen: new Date(Date.now() - 72 * 3_600_000).toISOString(),
        });
      });
    const { service, rpc } = serviceWith(fetchImpl, () => ({
      data: 'attempt-2',
      error: null,
    }));

    await service.resolveSentryIssue('42', 'Dead history cleanup.', 'taii');

    const delegatedCall = rpc.mock.calls.find(
      (call) => call[0] === 'ops_claim_delegated_resolution',
    );
    expect(delegatedCall?.[1]).toMatchObject({ p_actor: 'taii' });
    expect(
      (
        delegatedCall?.[1] as unknown as {
          p_evidence: { delegated: boolean };
        }
      ).p_evidence,
    ).toMatchObject({ delegated: true });
  });

  it('refuses delegation when the issue reports no last-seen time', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: '42', status: 'unresolved' }));
    const { service } = serviceWith(fetchImpl, () => ({
      data: 'attempt-2',
      error: null,
    }));

    await expect(
      service.resolveSentryIssue('42', 'Dead history cleanup.', 'taii'),
    ).rejects.toThrow('no last-seen time');
  });
});

describe('default social adapter render branches', () => {
  const renderTarget = {
    episodeId: '11111111-1111-4111-8111-111111111111',
    localizationId: '22222222-2222-4222-8222-222222222222',
    renderStatus: 'failed',
    renderCompletedAt: null,
    renderLeaseExpiresAt: null,
    visualStatus: 'completed',
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
    deploymentOpen: true,
    abandonedAt: null,
  };

  function baseService(config: ReturnType<typeof readControlCenterConfig>) {
    return createOperationsService({
      config,
      now: () => NOW,
      adapters: {
        product: async () => [],
        costs: async () => [],
        github: async () => [],
        fly: async () => [],
        sentry: async () => [],
        posthog: async () => [],
      },
    });
  }

  it('adds an eligible render signal when persistence answers', async () => {
    supabaseFake.current = () => emptySupabaseClient();
    const { client } = rpcClient(() => ({ data: [renderTarget], error: null }));
    fakeClient.current = client;
    const service = baseService(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      }),
    );

    const response = await service.getOperations();
    expect(
      response.signals.some(
        (item) =>
          item.fingerprint ===
          `social-queue:render/${renderTarget.localizationId}`,
      ),
    ).toBe(true);
  });

  it('reports a source failure when render targets cannot be read', async () => {
    supabaseFake.current = () => emptySupabaseClient();
    fakeClient.current = null;
    const service = baseService(
      readControlCenterConfig({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      }),
    );

    const response = await service.getOperations();
    expect(
      response.signals.some(
        (item) => item.fingerprint === 'social-queue:source-failure/adapter',
      ),
    ).toBe(true);
  });
});

async function serviceSocialResponse() {
  return {
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
    waitingMedia: {
      lanes: 0,
      rowsRead: 0,
      oldestWaitingSince: null,
      oldestEpisodeId: null,
      oldestLanguageCode: null,
      blockedLanes: 0,
      invalidRows: 0,
      message: null,
    },
    invalidJobRows: 0,
    message: null,
  } as never;
}

async function serviceCustomersResponse(
  service: ReturnType<typeof createOperationsService>,
) {
  void service;
  return {
    generatedAt: NOW.toISOString(),
    status: 'ok',
    message: null,
    summary: {
      totalCustomers: 0,
      priorityUsers: 0,
      standardUsers: 0,
      pausedUsers: 0,
      activeLast7d: 0,
      inactiveButPriority: 0,
      aumUsd: 0,
      attributedCostUsd30d: 0,
      revenueUsd: null,
    },
    users: [],
  } as never;
}
