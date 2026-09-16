import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  config: { CONTROL_CENTER_PORT: 4175 },
  operations: { marker: 'operations-service' },
  server: { marker: 'mcp-server' },
  factory: null as null | (() => unknown),
  aggregateInput: null as unknown,
  serverInput: null as unknown,
  serverCalls: 0,
  serveCalls: 0,
}));

vi.mock('../config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));
vi.mock('../services/operations/aggregate.js', () => ({
  createOperationsService: (input: unknown) => {
    state.aggregateInput = input;
    return state.operations;
  },
}));
vi.mock('./server.js', () => ({
  createOpsMcpServer: (operations: unknown) => {
    state.serverInput = operations;
    state.serverCalls += 1;
    return state.server;
  },
}));
vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: (factory: () => unknown) => {
    state.factory = factory;
    state.serveCalls += 1;
  },
}));

describe('ops MCP stdio entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    state.factory = null;
    state.aggregateInput = null;
    state.serverInput = null;
    state.serverCalls = 0;
    state.serveCalls = 0;
  });

  it('serves the operations MCP server over stdio', async () => {
    await import('./stdio.js');

    expect(state.aggregateInput).toEqual({ config: state.config });
    expect(state.serveCalls).toBe(1);
    expect(state.factory).toBeTypeOf('function');

    const produced = state.factory!();
    expect(state.serverInput).toBe(state.operations);
    expect(state.serverCalls).toBe(1);
    expect(produced).toBe(state.server);
  });
});
