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
const OPEN_WORKING = {
  ...OPEN_READY,
  number: 452,
  title: 'Already in progress',
  labels: [...OPEN_READY.labels, 'status:working'],
};
const OPEN_BLOCKED = {
  ...OPEN_READY,
  number: 453,
  title: 'Needs product judgement',
  labels: [...OPEN_READY.labels, 'blocked'],
};
const CLOSED_RECENT = {
  ...OPEN_READY,
  number: 450,
  state: 'closed',
  closed_at: '2026-09-10T12:00:00.000Z',
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

function githubRouter(config: {
  open?: unknown[];
  closed?: unknown[];
  issues?: Record<number, unknown>;
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
      const issue = /\/issues\/(\d+)$/u.exec(parsed.pathname)?.[1];
      if (issue) {
        return json(config.issues?.[Number(issue)] ?? OPEN_READY);
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

  it('derives ready, working and blocked directly from GitHub labels', async () => {
    const fetchImpl = githubRouter({
      open: [OPEN_READY, OPEN_WORKING, OPEN_BLOCKED],
      closed: [CLOSED_RECENT],
    });
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
    });

    const result = await service.getBacklog();

    expect(result).toMatchObject({
      status: 'ok',
      ready: 1,
      working: 1,
      blocked: 1,
      completed7d: 1,
      truncated: false,
    });
    expect(result.items.map((item) => [item.issueNumber, item.status])).toEqual(
      [
        [451, 'ready'],
        [452, 'working'],
        [453, 'blocked'],
      ],
    );

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
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: githubRouter({ open: fullPage, closed: [] }),
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

  it('claims the oldest ready issue by adding status:working', async () => {
    const older = {
      ...OPEN_READY,
      number: 440,
      created_at: '2026-09-01T00:00:00.000Z',
    };
    const writes: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = githubRouter({
      open: [OPEN_READY, older, OPEN_WORKING, OPEN_BLOCKED],
      closed: [],
      onWrite: (url, init) => {
        writes.push({
          url,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        if (url.endsWith('/labels')) {
          return json([{ name: 'status:working' }]);
        }
        return json({});
      },
    });
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
    });

    const result = await service.claimBacklog({ agentId: 'weak-1' });

    expect(result).toMatchObject({
      claimed: true,
      item: { issueNumber: 440, status: 'working' },
    });
    expect(
      writes.find((write) => write.url.endsWith('/issues/440/labels'))?.body,
    ).toEqual({ labels: ['status:working'] });
    expect(
      writes.some((write) => write.url.includes('/issues/440/comments')),
    ).toBe(true);
  });

  it('can restrict claims to an area without effort ranking', async () => {
    const otherArea = {
      ...OPEN_READY,
      number: 430,
      created_at: '2026-09-01T00:00:00.000Z',
      labels: ['agent-backlog', 'agent:weak', 'risk:low', 'area:analytics'],
    };
    const writes: string[] = [];
    const fetchImpl = githubRouter({
      open: [otherArea, OPEN_READY],
      closed: [],
      onWrite: (url) => {
        writes.push(url);
        return url.endsWith('/labels')
          ? json([{ name: 'status:working' }])
          : json({});
      },
    });
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
    });

    const result = await service.claimBacklog({
      agentId: 'weak-1',
      areas: ['control-center'],
    });

    expect(result.item?.issueNumber).toBe(451);
    expect(writes.some((url) => url.includes('/issues/451/'))).toBe(true);
    expect(writes.some((url) => url.includes('/issues/430/'))).toBe(false);
  });

  it('does not claim when the authoritative working-label write fails', async () => {
    const fetchImpl = githubRouter({
      open: [OPEN_READY],
      closed: [],
      onWrite: (url) => {
        if (url.endsWith('/labels')) {
          return json({ message: 'boom' }, 500);
        }
        return json({});
      },
    });
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
    });

    await expect(service.claimBacklog({ agentId: 'weak-1' })).rejects.toThrow();
  });

  it('releases only an agent-backlog issue that is currently working', async () => {
    const writes: string[] = [];
    const fetchImpl = githubRouter({
      issues: { 452: OPEN_WORKING },
      onWrite: (url) => {
        writes.push(url);
        return json({});
      },
    });
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
    });

    await expect(
      service.releaseClaim({
        issueNumber: 452,
        agentId: 'weak-1',
        outcome: 'released',
        reason: 'Returning this bounded task to the queue.',
      }),
    ).resolves.toEqual({ released: true });
    expect(writes.some((url) => url.includes('/labels/status%3Aworking'))).toBe(
      true,
    );
  });

  it('marks blocked before removing status:working', async () => {
    const writes: Array<{ url: string; method?: string }> = [];
    const fetchImpl = githubRouter({
      issues: { 452: OPEN_WORKING },
      onWrite: (url, init) => {
        writes.push({ url, method: init.method });
        return url.endsWith('/labels')
          ? json([{ name: 'blocked' }, { name: 'status:working' }])
          : json({});
      },
    });
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl,
    });

    await service.releaseClaim({
      issueNumber: 452,
      agentId: 'weak-1',
      outcome: 'blocked',
      reason: 'Needs a stronger architecture decision.',
    });

    expect(writes[0]?.url).toMatch(/\/issues\/452\/labels$/u);
    expect(writes[1]).toMatchObject({ method: 'DELETE' });
  });

  it('refuses release against an unrelated or ready issue', async () => {
    const unrelated = {
      ...OPEN_WORKING,
      labels: ['bug', 'status:working'],
    };
    const service = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl: githubRouter({ issues: { 999: unrelated } }),
    });

    await expect(
      service.releaseClaim({
        issueNumber: 999,
        agentId: 'weak-1',
        outcome: 'released',
        reason: 'This must not mutate arbitrary issues.',
      }),
    ).rejects.toThrow('not part of the agent backlog');

    const readyService = createAgentBacklogService({
      config: configured(true),
      now: () => NOW,
      fetchImpl: githubRouter({ issues: { 451: OPEN_READY } }),
    });

    await expect(
      readyService.releaseClaim({
        issueNumber: 451,
        agentId: 'weak-1',
        outcome: 'released',
        reason: 'This issue was never claimed.',
      }),
    ).rejects.toThrow('not currently working');
  });
});
