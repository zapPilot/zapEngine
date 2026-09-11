import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { createAgentBacklogService } from './agent-backlog.js';

const NOW = new Date('2026-09-11T02:30:00.000Z');
const CUTOFF_ISO = new Date(
  NOW.getTime() - 7 * 24 * 60 * 60 * 1000,
).toISOString();

const OPEN_READY = {
  number: 451,
  title: 'Add loading skeleton',
  body: 'Small UI cleanup',
  html_url: 'https://github.com/zapPilot/zapEngine/issues/451',
  state: 'open',
  created_at: '2026-09-10T00:00:00.000Z',
  updated_at: '2026-09-10T01:00:00.000Z',
  closed_at: null,
  labels: ['agent-backlog', 'agent:weak', 'risk:low', 'area:control-center'],
};
const OPEN_BLOCKED = {
  ...OPEN_READY,
  number: 452,
  title: 'Needs product judgement',
  labels: [...OPEN_READY.labels, 'blocked'],
};
const CLOSED_RECENT = {
  ...OPEN_READY,
  number: 450,
  state: 'closed',
  closed_at: '2026-09-10T12:00:00.000Z',
};
const CLAIM_OFFSET = {
  claimId: '11111111-1111-4111-8111-111111111111',
  issueNumber: 451,
  agentId: 'weak-1',
  // Postgres timestamptz serializes with an explicit UTC offset, never the
  // `Z` suffix GitHub uses -- this is the exact shape that broke getBacklog()
  // before the offset-aware parser landed (F1).
  claimedAt: '2026-09-11T02:00:00.123456+00:00',
  leaseExpiresAt: '2026-09-11T03:00:00.123456+00:00',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function configured(write = false) {
  return readControlCenterConfig({
    OPS_GITHUB_BACKLOG_TOKEN: 'backlog-token',
    OPS_BACKLOG_WRITE_ENABLED: write ? 'true' : 'false',
  });
}

/** Routes GitHub reads by query shape and RPC calls by name so multi-call
 * flows (open+closed issue fetch, comment-then-label mirror writes) do not
 * depend on invocation order. */
function githubRouter(config: {
  open?: unknown[];
  closed?: unknown[];
  onWrite?: (url: string, init: RequestInit) => Response | undefined;
}) {
  return vi.fn<typeof fetch>(async (resource, init) => {
    const url = resource.toString();
    if (init?.method === undefined || init.method === 'GET') {
      const parsed = new URL(url);
      if (parsed.searchParams.get('state') === 'open') {
        return json(config.open ?? []);
      }
      if (parsed.searchParams.get('state') === 'closed') {
        return json(config.closed ?? []);
      }
    }
    const written = config.onWrite?.(url, init ?? {});
    return written ?? json({});
  });
}

describe('agent backlog', () => {
  it('stays explicitly unconfigured without the dedicated token', async () => {
    const service = createAgentBacklogService({
      config: readControlCenterConfig({}),
      now: () => NOW,
      store: { rpc: vi.fn() },
      fetchImpl: vi.fn(),
    });

    await expect(service.getBacklog()).resolves.toMatchObject({
      status: 'unconfigured',
      ready: 0,
      working: 0,
      blocked: 0,
      truncated: false,
    });
  });

  it('joins GitHub issue truth with temporary claim leases across offset timestamps', async () => {
    const fetchImpl = githubRouter({
      open: [OPEN_READY, OPEN_BLOCKED],
      closed: [CLOSED_RECENT],
    });
    const store = { rpc: vi.fn().mockResolvedValue([CLAIM_OFFSET]) };
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.getBacklog();

    expect(result).toMatchObject({
      status: 'ok',
      ready: 0,
      working: 1,
      blocked: 1,
      completed7d: 1,
      truncated: false,
    });
    expect(result.items[0]).toMatchObject({
      issueNumber: 451,
      area: 'control-center',
      status: 'working',
      claim: CLAIM_OFFSET,
    });
    expect(store.rpc).toHaveBeenCalledWith('ops_agent_backlog_claims');

    const closedCall = fetchImpl.mock.calls.find(
      (call) =>
        new URL(call[0] as string).searchParams.get('state') === 'closed',
    );
    expect(closedCall).toBeDefined();
    expect(new URL(closedCall![0] as string).searchParams.get('since')).toBe(
      CUTOFF_ISO,
    );
  });

  it('flags truncation instead of silently dropping issues past one page', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      ...OPEN_READY,
      number: 1000 + index,
    }));
    const fetchImpl = githubRouter({ open: fullPage, closed: [] });
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
      store: { rpc: vi.fn().mockResolvedValue([]) },
    });

    const result = await service.getBacklog();

    expect(result.truncated).toBe(true);
    expect(result.message).toMatch(/full page/u);
  });

  it('fails closed when writes are not explicitly enabled', async () => {
    const service = createAgentBacklogService({
      config: configured(false),
      now: () => NOW,
      fetchImpl: vi.fn(),
      store: { rpc: vi.fn() },
    });

    await expect(
      service.createBacklogItem({
        title: 'Improve a bounded test',
        problem: 'A small branch is not covered.',
        expectedOutcome: 'The branch has a regression test.',
        acceptanceCriteria: ['Add the missing assertion'],
      }),
    ).rejects.toThrow('writes are disabled');
  });

  it('creates only the allowlisted weak-agent issue shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(OPEN_READY));
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store: { rpc: vi.fn() },
    });

    const created = await service.createBacklogItem({
      title: 'Add loading skeleton',
      problem: 'One loading state renders final empty copy too early.',
      expectedOutcome:
        'Loading renders a skeleton before the provider settles.',
      acceptanceCriteria: ['Skeleton is visible while the request is pending'],
      area: 'control-center',
      relevantFiles: ['apps/control-center/src/client'],
      outOfScope: ['Do not redesign the page'],
    });

    expect(created.issueNumber).toBe(451);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      labels: string[];
      body: string;
    };
    expect(body.labels).toEqual([
      'agent-backlog',
      'agent:weak',
      'risk:low',
      'area:control-center',
    ]);
    expect(body.body).toContain('## Acceptance criteria');
  });

  it('orders claim candidates by effort before creation order', async () => {
    const biggish = {
      ...OPEN_READY,
      number: 501,
      created_at: '2026-09-01T00:00:00.000Z',
      labels: ['agent-backlog', 'effort:m'],
    };
    const unranked = {
      ...OPEN_READY,
      number: 502,
      created_at: '2026-09-02T00:00:00.000Z',
      labels: ['agent-backlog'],
    };
    const tiny = {
      ...OPEN_READY,
      number: 503,
      created_at: '2026-09-03T00:00:00.000Z',
      labels: ['agent-backlog', 'effort:xs'],
    };
    const fetchImpl = githubRouter({
      open: [biggish, unranked, tiny],
      closed: [],
    });
    const store = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce([]) // ops_agent_backlog_claims (no active leases)
        .mockResolvedValueOnce({ claim: null, reused: false, expired: [] }), // ops_claim_agent_backlog
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    await service.claimBacklog({ agentId: 'weak-1' });

    expect(store.rpc).toHaveBeenLastCalledWith('ops_claim_agent_backlog', {
      p_issue_numbers: [503, 501, 502],
      p_agent_id: 'weak-1',
      p_lease_seconds: 3600,
    });
  });

  it('atomically claims the first ready issue and best-effort mirrors it to GitHub', async () => {
    const writes: Array<{ url: string; method?: string }> = [];
    const fetchImpl = githubRouter({
      open: [OPEN_READY],
      closed: [],
      onWrite: (url, init) => {
        writes.push({ url, method: init.method });
        return json([{ name: 'status:working' }]);
      },
    });
    const store = {
      rpc: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({
        claim: CLAIM_OFFSET,
        reused: false,
        expired: [],
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.claimBacklog({
      agentId: 'weak-1',
      areas: ['control-center'],
    });

    expect(result).toMatchObject({
      claimed: true,
      reused: false,
      item: { issueNumber: 451, status: 'working', claim: CLAIM_OFFSET },
      mirror: 'ok',
    });
    expect(store.rpc).toHaveBeenLastCalledWith('ops_claim_agent_backlog', {
      p_issue_numbers: [451],
      p_agent_id: 'weak-1',
      p_lease_seconds: 3600,
    });
    expect(writes.some((call) => call.url.includes('/comments'))).toBe(true);
    expect(writes.some((call) => call.url.endsWith('/issues/451/labels'))).toBe(
      true,
    );
  });

  it('passes reused claims through without treating them as new work', async () => {
    const fetchImpl = githubRouter({ open: [OPEN_READY], closed: [] });
    const store = {
      rpc: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({
        claim: CLAIM_OFFSET,
        reused: true,
        expired: [],
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.claimBacklog({ agentId: 'weak-1' });

    expect(result).toMatchObject({ claimed: true, reused: true });
  });

  it('never fails a committed claim when both GitHub mirror writes fail', async () => {
    const fetchImpl = githubRouter({
      open: [OPEN_READY],
      closed: [],
      onWrite: () => {
        throw new Error('GitHub is unreachable');
      },
    });
    const store = {
      rpc: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({
        claim: CLAIM_OFFSET,
        reused: false,
        expired: [],
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.claimBacklog({ agentId: 'weak-1' });

    expect(result.claimed).toBe(true);
    expect(result.mirror).toBe('failed');
  });

  it('best-effort removes the working label of every lease it swept as expired', async () => {
    const deletes: string[] = [];
    const fetchImpl = githubRouter({
      open: [OPEN_READY],
      closed: [],
      onWrite: (url, init) => {
        if (init.method === 'DELETE') {
          deletes.push(url);
        }
        return json([]);
      },
    });
    const store = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({
          claim: CLAIM_OFFSET,
          reused: false,
          expired: [
            {
              issueNumber: 460,
              claimId: '22222222-2222-4222-8222-222222222222',
              agentId: 'stale-agent',
            },
          ],
        }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    await service.claimBacklog({ agentId: 'weak-1' });

    expect(
      deletes.some((url) =>
        url.includes('/issues/460/labels/status%3Aworking'),
      ),
    ).toBe(true);
  });

  it('verifies ownership through the RPC before writing the blocked label', async () => {
    const calls: string[] = [];
    const fetchImpl = githubRouter({
      onWrite: () => {
        calls.push('github');
        return json([{ name: 'blocked' }]);
      },
    });
    const store = {
      rpc: vi.fn().mockImplementation(async (name: string) => {
        calls.push(name);
        return {
          released: true,
          alreadyReleased: false,
          issueNumber: 451,
          outcome: 'blocked',
        };
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.releaseClaim({
      claimId: CLAIM_OFFSET.claimId,
      issueNumber: 451,
      agentId: 'weak-1',
      outcome: 'blocked',
      reason: 'Needs an architecture decision from a stronger agent.',
    });

    expect(result).toEqual({
      released: true,
      alreadyReleased: false,
      mirror: 'ok',
    });
    expect(store.rpc).toHaveBeenCalledWith('ops_release_agent_backlog', {
      p_claim_id: CLAIM_OFFSET.claimId,
      p_agent_id: 'weak-1',
      p_issue_number: 451,
      p_outcome: 'blocked',
      p_reason: 'Needs an architecture decision from a stronger agent.',
    });
    // The RPC (ownership verification + commit) must resolve before any
    // GitHub write is attempted, so an unrelated caller can never reach the
    // label endpoint by supplying a claim it does not own.
    expect(calls[0]).toBe('ops_release_agent_backlog');
    expect(calls.slice(1)).toContain('github');
  });

  it('rejects a release whose issueNumber does not match the leased claim', async () => {
    const store = {
      rpc: vi.fn().mockResolvedValue({
        released: false,
        alreadyReleased: false,
        issueNumber: 999,
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl: vi.fn(),
      store,
    });

    await expect(
      service.releaseClaim({
        claimId: CLAIM_OFFSET.claimId,
        issueNumber: 999,
        agentId: 'weak-1',
        outcome: 'released',
        reason: 'Attempting to release an unowned issue.',
      }),
    ).rejects.toThrow('no longer active');
  });

  it('treats a repeated release as an idempotent no-op, including on GitHub', async () => {
    const fetchImpl = vi.fn();
    const store = {
      rpc: vi.fn().mockResolvedValue({
        released: true,
        alreadyReleased: true,
        issueNumber: 451,
        outcome: 'released',
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.releaseClaim({
      claimId: CLAIM_OFFSET.claimId,
      issueNumber: 451,
      agentId: 'weak-1',
      outcome: 'released',
      reason: 'Retrying after a dropped response.',
    });

    expect(result).toEqual({
      released: true,
      alreadyReleased: true,
      mirror: 'skipped',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renews a live lease without touching GitHub', async () => {
    const fetchImpl = vi.fn();
    const store = {
      rpc: vi.fn().mockResolvedValue({
        renewed: true,
        leaseExpiresAt: '2026-09-11T05:00:00.123456+00:00',
      }),
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    const result = await service.renewClaim({
      claimId: CLAIM_OFFSET.claimId,
      agentId: 'weak-1',
      leaseSeconds: 7200,
    });

    expect(result).toEqual({
      renewed: true,
      leaseExpiresAt: '2026-09-11T05:00:00.123456+00:00',
    });
    expect(store.rpc).toHaveBeenCalledWith('ops_renew_agent_backlog', {
      p_claim_id: CLAIM_OFFSET.claimId,
      p_agent_id: 'weak-1',
      p_lease_seconds: 7200,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gates renew on write-enable like every other backlog mutation', async () => {
    const service = createAgentBacklogService({
      config: configured(false),
      now: () => NOW,
      fetchImpl: vi.fn(),
      store: { rpc: vi.fn() },
    });

    await expect(
      service.renewClaim({
        claimId: CLAIM_OFFSET.claimId,
        agentId: 'weak-1',
      }),
    ).rejects.toThrow('writes are disabled');
  });
});
