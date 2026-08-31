import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type OperationsResponse,
} from '../../shared/types.js';
import { registerOpsMcpHttp } from './http.js';
import type { OpsMcpOperations } from './types.js';

const PROTOCOL_VERSION = '2025-06-18';
const TOKEN = 'secret-token';
const SNAPSHOT: OperationsResponse = {
  generatedAt: '2026-08-31T00:00:00.000Z',
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
    getSocial: vi.fn(),
    getCustomers: vi.fn(),
    inspectSignal: vi.fn(),
    investigate: vi.fn(),
  };
}

describe('Ops MCP HTTP auth', () => {
  it('does not reveal whether the remote token is configured', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, { operations: fakeOperations() });

    const response = await app.request('/api/mcp', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects requests without the configured bearer token', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, {
      operations: fakeOperations(),
      token: TOKEN,
    });

    const response = await app.request('/api/mcp', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects the wrong bearer token', async () => {
    /* jscpd:ignore-start -- parallel auth test fixture, intentional duplicate */
    const app = new Hono();
    registerOpsMcpHttp(app, {
      operations: fakeOperations(),
      token: TOKEN,
    });

    const response = await app.request('/api/mcp', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });
    /* jscpd:ignore-end */

    expect(response.status).toBe(401);
  });
});

describe('Ops MCP HTTP protocol', () => {
  it('initializes the MCP server with the configured bearer token', async () => {
    const app = createAuthenticatedApp();
    const { response, payload } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'control-center-test', version: '1.0.0' },
      },
    });

    expect(response.status).toBe(200);
    expect(payload.result?.serverInfo?.name).toBe('zap-pilot-ops');
  });

  it('lists the operations tools', async () => {
    const app = createAuthenticatedApp();
    const { response, payload } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(response.status).toBe(200);
    expect(payload.result?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'ops_status',
        'ops_domain',
        'ops_signal',
        'ops_inspect_signal',
        'ops_investigate',
        'ops_customers',
        'ops_social',
        'ops_costs',
      ]),
    );
  });

  it('calls ops_status and returns structured content', async () => {
    const operations = fakeOperations();
    const app = createAuthenticatedApp(operations);
    const { response, payload } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ops_status', arguments: {} },
    });

    expect(response.status).toBe(200);
    expect(payload.result?.structuredContent).toEqual(SNAPSHOT);
    expect(operations.getOperations).toHaveBeenCalledWith(false);
  });
});

function createAuthenticatedApp(operations = fakeOperations()) {
  const app = new Hono();
  registerOpsMcpHttp(app, { operations, token: TOKEN });
  return app;
}

async function mcpRequest(
  app: Hono,
  body: Record<string, unknown>,
): Promise<{ response: Response; payload: JsonRpcResponse }> {
  const response = await app.request('/api/mcp', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': PROTOCOL_VERSION,
    },
    body: JSON.stringify(body),
  });

  return { response, payload: await readMcpPayload(response) };
}

async function readMcpPayload(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  const dataLine = text
    .split('\n')
    .find((line) => line.startsWith('data: '));
  return JSON.parse(dataLine ? dataLine.slice('data: '.length) : text) as JsonRpcResponse;
}

interface JsonRpcResponse {
  result?: {
    serverInfo?: { name?: string };
    structuredContent?: unknown;
    tools?: Array<{ name: string }>;
  };
}
