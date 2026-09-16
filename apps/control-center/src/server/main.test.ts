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

const extended = state as typeof state & {
  registerArgs?: unknown;
};

vi.mock('./observability/sentry.js', () => ({
  initSentry: () => state.sentryEnabled,
}));
vi.mock('./app.js', () => ({
  createControlCenterApp: () => state.app,
}));
vi.mock('./config/env.js', () => ({
  readControlCenterConfig: () => state.config,
}));
vi.mock('./register-podcast-abandon.js', () => ({
  registerPodcastAbandonRoute: (app: unknown, input: unknown) => {
    extended.registerArgs = { app, input };
  },
}));

let nodeEnvBackup: string | undefined;
let shaBackup: string | undefined;

beforeEach(() => {
  vi.resetModules();
  extended.logCalls = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    extended.logCalls.push(args.map(String).join(' '));
  });
  nodeEnvBackup = process.env['NODE_ENV'];
  shaBackup = process.env['APP_COMMIT_SHA'];
  delete process.env['NODE_ENV'];
  delete process.env['APP_COMMIT_SHA'];
  state.sentryEnabled = false;
  state.serveArgs = null;
  extended.registerArgs = null;
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

    expect(extended.logCalls.join('\n')).toContain('[sentry] disabled');
    expect(extended.logCalls.join('\n')).toContain('environment=unknown');
    expect(extended.logCalls.join('\n')).toContain('release=unknown');
    const serveArgs = state.serveArgs as {
      hostname: string;
      port: number;
      fetch: unknown;
    };
    expect(serveArgs.hostname).toBe('127.0.0.1');
    expect(serveArgs.port).toBe(4321);
    expect(serveArgs.fetch).toBe(state.app.fetch);
    const registerArgs = extended.registerArgs as {
      app: unknown;
      input: { config: unknown };
    };
    expect(registerArgs.app).toBe(state.app);
    expect(registerArgs.input).toEqual({ config: state.config });
    expect(extended.logCalls.join('\n')).toContain(
      'Control Center API: http://127.0.0.1:4321',
    );
  });

  it('boots with Sentry enabled and known provenance', async () => {
    state.sentryEnabled = true;
    process.env['NODE_ENV'] = 'production';
    process.env['APP_COMMIT_SHA'] = 'abc123';
    await import('./main.js');

    expect(extended.logCalls.join('\n')).toContain(
      '[sentry] enabled environment=production release=abc123',
    );
    const serveArgs = state.serveArgs as { hostname: string; port: number };
    expect(serveArgs.hostname).toBe('127.0.0.1');
    expect(serveArgs.port).toBe(4321);
  });
});
