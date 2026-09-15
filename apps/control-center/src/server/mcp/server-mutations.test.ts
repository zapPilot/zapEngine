import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { AgentBacklogResponse } from '../../shared/agent-backlog.js';
import {
  OPERATIONS_DOMAINS,
  type OperationsResponse,
} from '../../shared/types.js';
import { registerOpsMcpHttp } from './http.js';
import type { OpsMcpOperations } from './types.js';

const TOKEN = 'mutation-token';
const PROTOCOL_VERSION = '2025-06-18';

const SNAPSHOT: OperationsResponse = {
  generatedAt: '2026-09-10T00:00:00.000Z',
  status: 'healthy',
  domains: OPERATIONS_DOMAINS.map((domain) => ({
    domain,
    status: 'healthy',
    signalCount: 0,
  })),
  priorities: [],
  signals: [],
};

const BACKLOG: AgentBacklogResponse = {
  generatedAt: '2026-09-10T00:00:00.000Z',
  status: 'ok',
  message: null,
  repo: 'zapPilot/zapEngine',
  ready: 0,
  working: 0,
  blocked: 0,
  completed7d: 0,
  items: [],
  truncated: false,
};

function fakeOperations(): OpsMcpOperations {
  return {
    getOperations: vi.fn().mockResolvedValue(SNAPSHOT),
    getSocial: vi.fn().mockResolvedValue({ generatedAt: SNAPSHOT.generatedAt }),
    getCustomers: vi
      .fn()
      .mockResolvedValue({ generatedAt: SNAPSHOT.generatedAt }),
    getBacklog: vi.fn().mockResolvedValue(BACKLOG),
    createBacklogItem: vi.fn().mockResolvedValue({ created: true, item: null }),
    claimBacklog: vi.fn().mockResolvedValue({ claimed: false, item: null }),
    releaseBacklog: vi.fn().mockResolvedValue({
      released: true,
      outcome: 'released',
      closed: false,
      verification: null,
    }),
    inspectSignal: vi.fn(),
    investigate: vi.fn(),
    resolveSentryIssue: vi.fn().mockResolvedValue({
      provider: 'sentry',
      issueId: '7',
      shortId: 'SHORT-7',
      title: 'Example',
      status: 'resolved',
      reason: 'Fixed and verified on main.',
    }),
  };
}

function app(operations = fakeOperations()) {
  const hono = new Hono();
  registerOpsMcpHttp(hono, { operations, token: TOKEN });
  return { hono, operations };
}

async function call(
  hono: Hono,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await hono.request('/api/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await response.text();
  const line = text.split('\n').find((entry) => entry.startsWith('data: '));
  const payload = JSON.parse(line ? line.slice('data: '.length) : text) as {
    result?: { structuredContent?: unknown };
    error?: unknown;
  };
  return { response, payload };
}

const CREATE = {
  title: 'Tighten render retry guard',
  problem: 'Operators retry renders without a bounded guard.',
  expectedOutcome: 'Retries stay bounded to one eligible render.',
  acceptanceCriteria: ['Retry refuses abandoned episodes'],
};

describe('ops MCP mutation boundary', () => {
  it('creates a backlog item through the mutation tool', async () => {
    const { hono, operations } = app();
    const { response, payload } = await call(
      hono,
      'ops_backlog_create',
      CREATE,
    );

    expect(response.status).toBe(200);
    expect(operations.createBacklogItem).toHaveBeenCalledWith(CREATE);
    expect(payload.result?.structuredContent).toMatchObject({ created: true });
  });

  it('rejects a fingerprint that smuggles markup or newlines', async () => {
    const { hono, operations } = app();
    for (const fingerprint of ['line-one\nline-two', 'abc-->def']) {
      const { payload } = await call(hono, 'ops_backlog_create', {
        ...CREATE,
        fingerprint,
      });
      expect(JSON.stringify(payload)).not.toContain('"created":true');
    }
    expect(operations.createBacklogItem).not.toHaveBeenCalled();
  });

  it('claims backlog work with an area filter', async () => {
    const { hono, operations } = app();
    const args = { agentId: 'worker-1', areas: ['social'] };
    const { response, payload } = await call(hono, 'ops_backlog_claim', args);

    expect(response.status).toBe(200);
    expect(operations.claimBacklog).toHaveBeenCalledWith(args);
    expect(payload.result?.structuredContent).toMatchObject({
      claimed: false,
    });
  });

  it('rejects an invalid worker identity at the boundary', async () => {
    const { hono, operations } = app();
    const { payload } = await call(hono, 'ops_backlog_claim', {
      agentId: 'not an id!!',
    });

    expect(JSON.stringify(payload)).not.toContain('"claimed":true');
    expect(operations.claimBacklog).not.toHaveBeenCalled();
  });

  it.each([
    { outcome: 'released', evidence: undefined, closed: false },
    {
      outcome: 'blocked',
      evidence: undefined,
      closed: false,
    },
    {
      outcome: 'already-fixed',
      evidence: { commitSha: 'abc1234' },
      closed: false,
    },
    {
      outcome: 'already-fixed',
      evidence: { prNumber: 451 },
      closed: false,
    },
  ])('releases backlog work for outcome $outcome', async (row) => {
    const { hono, operations } = app();
    const args = {
      agentId: 'worker-1',
      issueNumber: 451,
      outcome: row.outcome,
      reason: 'No longer reproducible on main branch.',
      ...(row.evidence ? { evidence: row.evidence } : {}),
    };
    const { response } = await call(hono, 'ops_backlog_release', args);

    expect(response.status).toBe(200);
    expect(operations.releaseBacklog).toHaveBeenCalledWith(args);
  });

  it('rejects already-fixed without evidence at the boundary', async () => {
    const { hono, operations } = app();
    const { payload } = await call(hono, 'ops_backlog_release', {
      agentId: 'worker-1',
      issueNumber: 451,
      outcome: 'already-fixed',
      reason: 'Already fixed on main branch.',
    });

    expect(JSON.stringify(payload)).not.toContain('"released":true');
    expect(operations.releaseBacklog).not.toHaveBeenCalled();
  });

  it.each([['customers'], ['social'], ['costs'], ['domain'], ['signal']])(
    'serves read tool %s',
    async (name) => {
      const { hono, operations } = app();
      if (name === 'domain') {
        const { response } = await call(hono, 'ops_domain', {
          domain: 'jobs',
        });
        expect(response.status).toBe(200);
        expect(operations.getOperations).toHaveBeenCalled();
        return;
      }
      if (name === 'signal') {
        const { response } = await call(hono, 'ops_signal', {
          fingerprint: 'sentry:issues/account-engine',
        });
        expect(response.status).toBe(200);
        expect(operations.getOperations).toHaveBeenCalled();
        return;
      }
      const tool = name === 'customers' ? 'ops_customers' : `ops_${name}`;
      const { response } = await call(hono, tool, {});
      expect(response.status).toBe(200);
    },
  );

  it('resolves without delegation on the verified-fix rail', async () => {
    const { hono, operations } = app();
    const args = {
      issueId: '7',
      reason: 'The production fix is deployed.',
    };
    const { response } = await call(hono, 'ops_resolve_sentry_issue', args);

    expect(response.status).toBe(200);
    expect(operations.resolveSentryIssue).toHaveBeenCalledWith(
      args.issueId,
      args.reason,
      undefined,
    );
  });

  it('resolves with delegation on the operator-delegated rail', async () => {
    const { hono, operations } = app();
    const args = {
      issueId: '7',
      reason: 'Dead history confirmed by a human operator.',
      delegatedBy: 'taii',
    };
    const { response } = await call(hono, 'ops_resolve_sentry_issue', args);

    expect(response.status).toBe(200);
    expect(operations.resolveSentryIssue).toHaveBeenCalledWith(
      args.issueId,
      args.reason,
      args.delegatedBy,
    );
  });
});
