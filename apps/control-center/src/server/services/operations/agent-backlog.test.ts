import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { createAgentBacklogService } from './agent-backlog.js';

const NOW = new Date('2026-09-11T02:30:00.000Z');
const ISSUE = {
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
const CLAIM = {
  claimId: '11111111-1111-4111-8111-111111111111',
  issueNumber: 451,
  agentId: 'weak-1',
  claimedAt: '2026-09-11T02:00:00.000Z',
  leaseExpiresAt: '2026-09-11T03:00:00.000Z',
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
    });
  });

  it('joins GitHub issue truth with temporary claim leases', async () => {
    const closed = {
      ...ISSUE,
      number: 450,
      state: 'closed',
      closed_at: '2026-09-10T12:00:00.000Z',
    };
    const blocked = {
      ...ISSUE,
      number: 452,
      title: 'Needs product judgement',
      labels: [...ISSUE.labels, 'blocked'],
    };
    const fetchImpl = vi.fn().mockResolvedValue(json([ISSUE, blocked, closed]));
    const store = {
      rpc: vi.fn().mockResolvedValue([CLAIM]),
    };
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
    });
    expect(result.items[0]).toMatchObject({
      issueNumber: 451,
      area: 'control-center',
      status: 'working',
      claim: CLAIM,
    });
    expect(store.rpc).toHaveBeenCalledWith('ops_agent_backlog_claims');
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
    const fetchImpl = vi.fn().mockResolvedValue(json(ISSUE));
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store: { rpc: vi.fn() },
    });

    const created = await service.createBacklogItem({
      title: 'Add loading skeleton',
      problem: 'One loading state renders final empty copy too early.',
      expectedOutcome: 'Loading renders a skeleton before the provider settles.',
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

  it('atomically claims the first ready issue through the lease RPC', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([ISSUE]));
    const store = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(CLAIM),
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
      item: { issueNumber: 451, status: 'working', claim: CLAIM },
    });
    expect(store.rpc).toHaveBeenLastCalledWith('ops_claim_agent_backlog', {
      p_repo: 'zapPilot/zapEngine',
      p_issue_numbers: [451],
      p_agent_id: 'weak-1',
      p_lease_seconds: 3600,
    });
  });

  it('marks blocked work in GitHub before releasing its lease', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json([{ name: 'blocked' }]));
    const store = { rpc: vi.fn().mockResolvedValue(true) };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
      store,
    });

    await expect(
      service.releaseClaim({
        claimId: CLAIM.claimId,
        issueNumber: 451,
        agentId: 'weak-1',
        outcome: 'blocked',
        reason: 'Needs an architecture decision from a stronger agent.',
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/issues/451/labels'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(store.rpc).toHaveBeenCalledWith('ops_release_agent_backlog', {
      p_claim_id: CLAIM.claimId,
      p_agent_id: 'weak-1',
      p_outcome: 'blocked',
      p_reason: 'Needs an architecture decision from a stronger agent.',
    });
  });
});
