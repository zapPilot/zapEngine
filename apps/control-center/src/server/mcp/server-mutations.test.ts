import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

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

function fakeOperations(): OpsMcpOperations {
  return {
    getOperations: vi.fn().mockResolvedValue(SNAPSHOT),
    getGrowth: vi.fn(),
    getSocial: vi.fn().mockResolvedValue({ generatedAt: SNAPSHOT.generatedAt }),
    getCustomers: vi
      .fn()
      .mockResolvedValue({ generatedAt: SNAPSHOT.generatedAt }),
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

describe('ops MCP mutation boundary', () => {
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
