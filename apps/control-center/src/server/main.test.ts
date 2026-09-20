import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sentryEnabled: false,
  config: { CONTROL_CENTER_PORT: 4321 },
  serveArgs: null as unknown,
  logCalls: [] as string[],
  app: { fetch: () => new Response('ok'), marker: 'app' },
}));

vi.mock('@hono/node-server', () => ({
  serve: (args: unknown) => {
    state.serveArgs = args;
  },
}));

vi.mock('./observability/sentry.js', () => ({
  initSentry: () => state.sentryEnabled,
}));
vi.mock('./app.js', () => ({
  createControlCenterApp: () => state.app,
}));
vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));

let nodeEnvBackup: string | undefined;
let shaBackup: string | undefined;

beforeEach(() => {
  vi.resetModules();
  state.logCalls = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    state.logCalls.push(args.map(String).join(' '));
  });
  nodeEnvBackup = process.env['NODE_ENV'];
  shaBackup = process.env['APP_COMMIT_SHA'];
  delete process.env['NODE_ENV'];
  delete process.env['APP_COMMIT_SHA'];
  state.sentryEnabled = false;
  state.serveArgs = null;
});

afterEach(() => {
  if (nodeEnvBackup === undefined) {
    delete process.env['NODE_ENV'];
  } else {
    process.env['NODE_ENV'] = nodeEnvBackup;
  }
  if (shaBackup === undefined) {
    delete process.env['APP_COMMIT_SHA'];
  } else {
    process.env['APP_COMMIT_SHA'] = shaBackup;
  }
  vi.restoreAllMocks();
});

describe('control center server entrypoint', () => {
  it('boots with Sentry disabled and unknown provenance', async () => {
    state.sentryEnabled = false;
    await import('./main.js');

    expect(state.logCalls.join('\n')).toContain('[sentry] disabled');
    expect(state.logCalls.join('\n')).toContain('environment=unknown');
    expect(state.logCalls.join('\n')).toContain('release=unknown');
    const serveArgs = state.serveArgs as {
      hostname: string;
      port: number;
      fetch: unknown;
    };
    expect(serveArgs.hostname).toBe('127.0.0.1');
    expect(serveArgs.port).toBe(4321);
    expect(serveArgs.fetch).toBe(state.app.fetch);
    expect(state.logCalls.join('\n')).toContain(
      'Control Center API: http://127.0.0.1:4321',
    );
  });

  it('boots with Sentry enabled and known provenance', async () => {
    state.sentryEnabled = true;
    process.env['NODE_ENV'] = 'production';
    process.env['APP_COMMIT_SHA'] = 'abc123';
    await import('./main.js');

    expect(state.logCalls.join('\n')).toContain(
      '[sentry] enabled environment=production release=abc123',
    );
    const serveArgs = state.serveArgs as { hostname: string; port: number };
    expect(serveArgs.hostname).toBe('127.0.0.1');
    expect(serveArgs.port).toBe(4321);
  });
});
