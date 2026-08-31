import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OPERATIONS_DOMAINS,
  type OperationsResponse,
} from '../../shared/types.js';
import { captureServerException } from '../observability/sentry.js';
import { registerOpsMcpHttp } from './http.js';
import { createOpsMcpServer } from './server.js';
import type { OpsMcpOperations } from './types.js';

vi.mock('../observability/sentry.js', () => ({
  captureServerException: vi.fn(),
}));
vi.mock('./server.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./server.js')>();
  return {
    ...actual,
    createOpsMcpServer: vi.fn(actual.createOpsMcpServer),
  };
});

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
const RESOLUTION = {
  provider: 'sentry' as const,
  issueId: '12345',
  shortId: 'ZAP-PILOT-NATIVE-1',
  title: 'Example issue',
  status: 'resolved' as const,
  reason: 'The production fix is deployed.',
};

beforeEach(() => {
  vi.mocked(captureServerException).mockClear();
});

function fakeOperations(): OpsMcpOperations {
  return {
    getOperations: vi.fn().mockResolvedValue(SNAPSHOT),
    getSocial: vi.fn(),
    getCustomers: vi.fn(),
    inspectSignal: vi.fn(),
    investigate: vi.fn(),
    resolveSentryIssue: vi.fn().mockResolvedValue(RESOLUTION),
  };
}

describe('Ops MCP HTTP auth', () => {
  it('does not reveal whether the remote token is configured', async () => {
    const app = new Hono();
    registerOpsMcpHttp(app, { operations: fakeOperations() });

    await expectUnauthorized(app);
  });

  it('rejects requests without the configured bearer token', async () => {
    const app = createAuthenticatedApp();
    await expectUnauthorized(app);
  });

  it('rejects the wrong bearer token', async () => {
    const app = createAuthenticatedApp();
    await expectUnauthorized(app, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
  });
});

describe('Ops MCP HTTP protocol', () => {
  it('initializes the MCP server with the configured bearer token', async () => {
    const app = createAuthenticatedApp();
    const { response, payload } = await mcpRequest(app, initializeRequest(1));

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
        'ops_resolve_sentry_issue',
      ]),
    );
  });

  it('calls ops_status and returns structured content', async () => {
    const operations = fakeOperations();
    const app = createAuthenticatedApp(operations);
    const { response, payload } = await mcpRequest(
      app,
      toolCallRequest(3, 'ops_status'),
    );

    expect(response.status).toBe(200);
    expect(payload.result?.structuredContent).toEqual(SNAPSHOT);
    expect(operations.getOperations).toHaveBeenCalledWith(false);
  });

  it('resolves one explicit Sentry issue through the bounded mutation tool', async () => {
    const operations = fakeOperations();
    const app = createAuthenticatedApp(operations);
    const arguments_ = {
      issueId: '12345',
      reason: 'The production fix is deployed.',
    };
    const { response, payload } = await mcpRequest(
      app,
      toolCallRequest(4, 'ops_resolve_sentry_issue', arguments_),
    );

    expect(response.status).toBe(200);
    expect(payload.result?.structuredContent).toEqual(RESOLUTION);
    expect(operations.resolveSentryIssue).toHaveBeenCalledWith(
      arguments_.issueId,
      arguments_.reason,
    );
  });

  it('reports factory failures through the SDK error hook', async () => {
    const error = new Error('sensitive factory failure');
    vi.mocked(createOpsMcpServer).mockImplementationOnce(() => {
      throw error;
    });
    const app = createAuthenticatedApp();

    const { response, payload } = await mcpRequest(app, initializeRequest(5));

    expect(response.status).toBe(500);
    expect(JSON.stringify(payload)).not.toContain(error.message);
    expect(captureServerException).toHaveBeenCalledWith(error, {
      route: '/api/mcp',
    });
  });
});

function createAuthenticatedApp(operations = fakeOperations()) {
  const app = new Hono();
  registerOpsMcpHttp(app, { operations, token: TOKEN });
  return app;
}

async function expectUnauthorized(app: Hono, init: RequestInit = {}) {
  const response = await app.request('/api/mcp', {
    ...init,
    method: 'POST',
  });

  expect(response.status).toBe(401);
  expect(response.headers.get('www-authenticate')).toBe('Bearer');
  await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
}

function initializeRequest(id: number): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'control-center-test', version: '1.0.0' },
    },
  };
}

function toolCallRequest(
  id: number,
  name: string,
  arguments_: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: arguments_ },
  };
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
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(
    dataLine ? dataLine.slice('data: '.length) : text,
  ) as JsonRpcResponse;
}

interface JsonRpcResponse {
  result?: {
    serverInfo?: { name?: string };
    structuredContent?: unknown;
    tools?: Array<{ name: string }>;
  };
}
