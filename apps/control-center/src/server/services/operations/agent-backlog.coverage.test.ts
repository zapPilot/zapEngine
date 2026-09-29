import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { createAgentBacklogService } from './agent-backlog.js';

const NOW = new Date('2026-09-11T02:30:00.000Z');

// jscpd:ignore-start -- bounded backlog fixtures duplicated for gap coverage isolation
function issue(overrides: Record<string, unknown> = {}) {
  return {
    number: 451,
    title: 'Bounded follow-up',
    body: 'Small scoped fix',
    html_url: 'https://github.com/zapPilot/zapEngine/issues/451',
    state: 'open',
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T01:00:00.000Z',
    closed_at: null,
    labels: ['agent-backlog', 'agent:weak', 'risk:low'],
    ...overrides,
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
// jscpd:ignore-end

function configured() {
  return readControlCenterConfig({
    OPS_GITHUB_BACKLOG_TOKEN: 'backlog-token',
  });
}

function backlogFetch(open: unknown[], closed: unknown[] = []) {
  return vi.fn<typeof fetch>(async (resource, init) => {
    const url = resource.toString();
    if (init?.method === undefined || init.method === 'GET') {
      const parsed = new URL(url);
      if (parsed.searchParams.get('state') === 'open') {
        return json(open);
      }
      if (parsed.searchParams.get('state') === 'closed') {
        return json(closed);
      }
      return json(open[0] ?? issue());
    }
    if (url.endsWith('/labels')) {
      return json([{ name: 'status:working' }]);
    }
    return json({});
  });
}

const validCreate = {
  title: 'Bounded correction',
  problem: 'A reproducible repository defect',
  expectedOutcome: 'The named test succeeds',
  acceptanceCriteria: ['pnpm test'],
};

describe('agent backlog coverage gaps', () => {
  it('reports the provider message when the GitHub read throws an Error', async () => {
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new Error('GitHub is down');
      }),
    });

    await expect(service.getBacklog()).resolves.toMatchObject({
      status: 'error',
      message: 'GitHub is down',
      items: [],
      truncated: false,
    });
  });

  it('falls back to a generic message when the GitHub read throws a non-Error', async () => {
    const rejection: unknown = 'boom';
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: vi.fn<typeof fetch>(() => Promise.reject(rejection)),
    });

    await expect(service.getBacklog()).resolves.toMatchObject({
      status: 'error',
      message: 'Agent backlog read failed.',
    });
  });

  it('reads the snapshot with defaults when neither clock nor fetch is provided', async () => {
    const stub = backlogFetch([]);
    vi.stubGlobal('fetch', stub);
    try {
      const result = await createAgentBacklogService({
        config: configured(),
      }).getBacklog();

      expect(result.status).toBe('ok');
      expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
      expect(stub.mock.calls.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['ab', 'ok-prefix-->suffix'])(
    'rejects fingerprint %s without touching GitHub',
    async (fingerprint) => {
      const fetchImpl = backlogFetch([]);
      const service = createAgentBacklogService({
        config: configured(),
        now: () => NOW,
        fetchImpl,
      });

      await expect(
        service.createBacklogItem({ ...validCreate, fingerprint }),
      ).rejects.toThrow('Invalid backlog fingerprint.');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('refuses claims when the snapshot carries the provider failure', async () => {
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: vi.fn<typeof fetch>(() =>
        Promise.reject(new Error('GitHub is down')),
      ),
    });

    await expect(service.claimBacklog({ agentId: 'weak-1' })).rejects.toThrow(
      'GitHub is down',
    );
  });

  it('treats a blank area filter as no filter and claims the oldest ready issue', async () => {
    const older = {
      ...issue(),
      number: 440,
      created_at: '2026-09-01T00:00:00.000Z',
    };
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: backlogFetch([issue(), older]),
    });

    const result = await service.claimBacklog({
      agentId: 'weak-1',
      areas: [''],
    });

    expect(result).toMatchObject({
      claimed: true,
      item: { issueNumber: 440, status: 'working' },
    });
  });

  it('reports no claim when every issue is already working', async () => {
    const fetchImpl = backlogFetch([
      { ...issue(), labels: [...issue().labels, 'status:working'] },
    ]);
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
    });

    await expect(service.claimBacklog({ agentId: 'weak-1' })).resolves.toEqual({
      claimed: false,
      item: null,
    });
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.method === 'GET'),
    ).toBe(true);
  });

  it('closes an already-fixed issue on a PR merged into main', async () => {
    const writes: string[] = [];
    const working = {
      ...issue(),
      labels: [...issue().labels, 'status:working'],
    };
    const fetchImpl: typeof fetch = async (resource, init) => {
      const url = String(resource);
      if (init?.method === 'GET' || init?.method === undefined) {
        if (url.includes('/pulls/')) {
          return json({ merged: true, base: { ref: 'main' } });
        }
        return json(working);
      }
      writes.push(`${init?.method} ${new URL(url).pathname}`);
      if (init?.method === 'PATCH') {
        return json({ ...working, state: 'closed' });
      }
      return json(url.endsWith('/labels') ? [] : {});
    };
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
    });

    const result = await service.releaseClaim({
      issueNumber: 451,
      agentId: 'worker',
      outcome: 'already-fixed',
      reason: 'Fixed upstream and merged',
      evidence: { prNumber: 502 },
    });

    expect(result).toEqual({
      released: true,
      outcome: 'already-fixed',
      closed: true,
      verification: 'PR #502 merged into main',
    });
    expect(writes.map((entry) => entry.split(' ')[0])).toEqual([
      'POST',
      'PATCH',
      'DELETE',
      'POST',
    ]);
  });

  it('rejects a PR merged outside main before any write', async () => {
    const writes: string[] = [];
    const working = {
      ...issue(),
      labels: [...issue().labels, 'status:working'],
    };
    const fetchImpl: typeof fetch = async (resource, init) => {
      if (init?.method !== 'GET' && init?.method !== undefined) {
        writes.push(String(resource));
      }
      if (String(resource).includes('/pulls/')) {
        return json({ merged: true, base: { ref: 'develop' } });
      }
      return json(working);
    };
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
    });

    await expect(
      service.releaseClaim({
        issueNumber: 451,
        agentId: 'worker',
        outcome: 'already-fixed',
        reason: 'Wrong branch target',
        evidence: { prNumber: 502 },
      }),
    ).rejects.toThrow('Fix PR must be merged into main.');
    expect(writes).toEqual([]);
  });

  it('rejects a malformed fix commit SHA before any write', async () => {
    const writes: string[] = [];
    const working = {
      ...issue(),
      labels: [...issue().labels, 'status:working'],
    };
    const fetchImpl: typeof fetch = async (resource, init) => {
      if (init?.method !== 'GET' && init?.method !== undefined) {
        writes.push(String(resource));
      }
      return json(working);
    };
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl,
    });

    await expect(
      service.releaseClaim({
        issueNumber: 451,
        agentId: 'worker',
        outcome: 'already-fixed',
        reason: 'Bad evidence shape',
        evidence: { commitSha: 'not-a-sha!!' },
      }),
    ).rejects.toThrow('Invalid fix commit SHA.');
    expect(writes).toEqual([]);
  });

  it('projects object labels while dropping null names', async () => {
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: backlogFetch([
        {
          ...issue(),
          labels: [
            { name: 'agent-backlog' },
            { name: 'agent:weak' },
            { name: 'risk:low' },
            { name: null },
            { name: 'area:control-center' },
          ],
        },
      ]),
    });

    const result = await service.getBacklog();

    expect(result).toMatchObject({ status: 'ok', ready: 1 });
    expect(result.items[0]?.labels).toEqual([
      'agent-backlog',
      'agent:weak',
      'risk:low',
      'area:control-center',
    ]);
    expect(result.items[0]?.area).toBe('control-center');
  });

  it('rejects an area that is not a lowercase slug', async () => {
    const service = createAgentBacklogService({
      config: configured(),
      now: () => NOW,
      fetchImpl: backlogFetch([]),
    });

    await expect(
      service.createBacklogItem({ ...validCreate, area: 'Not a slug!' }),
    ).rejects.toThrow('Backlog area must be a lowercase slug.');
  });
});
