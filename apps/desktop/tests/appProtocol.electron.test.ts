import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  handle: vi.fn(),
  registerSchemesAsPrivileged: vi.fn(),
}));

const sentryMocks = vi.hoisted(() => ({
  captureDesktopException: vi.fn(),
}));

vi.mock('electron', () => ({
  net: {
    fetch: electronMocks.fetch,
  },
  protocol: {
    handle: electronMocks.handle,
    registerSchemesAsPrivileged: electronMocks.registerSchemesAsPrivileged,
  },
}));

vi.mock('../src/main/sentry', () => ({
  captureDesktopException: sentryMocks.captureDesktopException,
}));

import {
  APP_SCHEME,
  registerAppProtocolHandler,
  registerAppScheme,
} from '../src/main/appProtocol';

type ProtocolHandler = (request: Request) => Promise<Response> | Response;

function getRegisteredHandler(): ProtocolHandler {
  const handler = electronMocks.handle.mock.calls[0]?.[1];
  expect(handler).toBeTypeOf('function');
  return handler as ProtocolHandler;
}

describe('registerAppScheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers app:// as a privileged streaming fetch scheme', () => {
    registerAppScheme();

    expect(electronMocks.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: APP_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
        },
      },
    ]);
  });
});

describe('registerAppProtocolHandler', () => {
  let tempRoot: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { force: true, recursive: true });
      tempRoot = undefined;
    }
  });

  it('returns an HTTP status response and reports it to Sentry when an asset cannot be resolved', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'zap-desktop-protocol-'));

    registerAppProtocolHandler(tempRoot);

    const response = await getRegisteredHandler()(
      new Request('app://bundle/missing.png'),
    );

    expect(response.status).toBe(404);
    expect(electronMocks.fetch).not.toHaveBeenCalled();
    expect(sentryMocks.captureDesktopException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureDesktopException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'asset-protocol',
        tags: expect.objectContaining({ 'asset.status': '404' }),
        context: expect.objectContaining({ pathname: '/missing.png' }),
      }),
    );
  });

  it('serves existing files through Electron net.fetch', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'zap-desktop-protocol-'));
    const assetPath = join(tempRoot, 'app.js');
    const fetchResponse = new Response('console.log("ok");');
    writeFileSync(assetPath, 'console.log("ok");');
    electronMocks.fetch.mockResolvedValue(fetchResponse);

    registerAppProtocolHandler(tempRoot);

    const response = await getRegisteredHandler()(
      new Request('app://bundle/app.js'),
    );

    expect(response).toBe(fetchResponse);
    expect(electronMocks.fetch).toHaveBeenCalledWith(
      pathToFileURL(assetPath).toString(),
    );
  });
});
