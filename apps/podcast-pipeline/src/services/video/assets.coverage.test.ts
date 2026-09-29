import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireRemoteImage,
  type FetchImage,
  pinnedFetchImage,
} from './assets.js';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock('node:dns/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:dns/promises')>()),
  lookup: mocks.lookup,
}));

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  request: mocks.request,
}));

const directories: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- deterministic DNS fixture
    { address: '8.8.8.8', family: 4 },
  ]);
});

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'assets-coverage-'));
  directories.push(directory);
  return directory;
}

function installHttpsResponse(
  options: {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
    body?: string | Uint8Array;
  } = {},
) {
  mocks.request.mockImplementation(
    (requestOptions: unknown, callback: (incoming: PassThrough) => void) => {
      let errorHandler: ((error: Error) => void) | undefined;
      const request = {
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === 'error') errorHandler = handler;
          return request;
        }),
        end: vi.fn(() => {
          if (options.body === '__REQUEST_ERROR__') {
            errorHandler?.(new Error('socket failed'));
            return;
          }
          const incoming = new PassThrough() as PassThrough & {
            statusCode?: number;
            headers: Record<string, string | string[] | undefined>;
          };
          incoming.statusCode = options.statusCode;
          incoming.headers = options.headers ?? {};
          callback(incoming);
          incoming.end(options.body ?? '');
        }),
      };
      Object.assign(request, { requestOptions });
      return request;
    },
  );
}

describe('assets transport coverage', () => {
  it('uses the default DNS resolver and pins all resolved addresses', async () => {
    const directory = await tempDirectory();
    const png = await sharp({
      create: {
        width: 800,
        height: 450,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const fetchImage = vi.fn<FetchImage>(
      async () => new Response(Uint8Array.from(png), { status: 200 }),
    );

    await expect(
      acquireRemoteImage('https://cdn.example.test/image.png', {
        workingDirectory: directory,
        filename: 'default-dns',
        fetchImage,
      }),
    ).resolves.toMatchObject({
      width: 800,
      height: 450,
      contentType: 'image/png',
    });

    expect(mocks.lookup).toHaveBeenCalledWith('cdn.example.test', {
      all: true,
      verbatim: true,
    });
    expect(fetchImage).toHaveBeenCalledWith(
      'https://cdn.example.test/image.png',
      expect.objectContaining({
        // eslint-disable-next-line sonarjs/no-hardcoded-ip -- deterministic DNS fixture
        pinnedAddresses: ['8.8.8.8'],
      }),
    );
  });

  it('uses the pinned HTTPS transport when no fetch override is supplied', async () => {
    const directory = await tempDirectory();
    const png = await sharp({
      create: {
        width: 800,
        height: 450,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    installHttpsResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/png' },
      body: png,
    });

    await expect(
      acquireRemoteImage('https://cdn.example.test/image.png', {
        workingDirectory: directory,
        filename: 'default-transport',
      }),
    ).resolves.toMatchObject({
      width: 800,
      height: 450,
      contentType: 'image/png',
    });
    expect(mocks.request).toHaveBeenCalledOnce();
  });

  it('converts a pinned https response into a web Response including repeated headers', async () => {
    installHttpsResponse({
      statusCode: 200,
      headers: {
        'content-type': 'text/plain',
        'set-cookie': ['a=1', 'b=2'],
        'x-ignored': undefined,
      },
      body: 'ok',
    });

    const response = await pinnedFetchImage(
      'https://example.test:444/image?q=1',
      {
        // eslint-disable-next-line sonarjs/no-hardcoded-ip -- pinned transport fixture
        pinnedAddresses: ['8.8.8.8'],
        headers: {
          'user-agent': 'coverage-agent',
          referer: 'https://ref.test/',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('set-cookie')).toContain('a=1');
    expect(mocks.request).toHaveBeenCalledOnce();
    const options = mocks.request.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toMatchObject({
      hostname: 'example.test',
      port: 444,
      path: '/image?q=1',
      agent: false,
    });
  });

  it('uses the default status, default port, default user agent, and null body for 204', async () => {
    installHttpsResponse({ statusCode: 204, headers: {}, body: '' });
    const noContent = await pinnedFetchImage('https://example.test/image', {
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- pinned transport fixture
      pinnedAddresses: ['8.8.8.8'],
    });
    expect(noContent.status).toBe(204);
    expect(await noContent.text()).toBe('');

    const firstOptions = mocks.request.mock.calls[0]?.[0] as {
      port: number;
      headers: Record<string, string>;
    };
    expect(firstOptions.port).toBe(443);
    expect(firstOptions.headers['user-agent']).toContain(
      'zapengine-podcast-pipeline',
    );

    installHttpsResponse({ headers: {}, body: 'gateway' });
    const gateway = await pinnedFetchImage('https://example.test/image', {
      // eslint-disable-next-line sonarjs/no-hardcoded-ip -- pinned transport fixture
      pinnedAddresses: ['8.8.8.8'],
    });
    expect(gateway.status).toBe(502);
    expect(await gateway.text()).toBe('gateway');
  });

  it('rejects when the pinned https request emits an error', async () => {
    installHttpsResponse({ body: '__REQUEST_ERROR__' });
    await expect(
      pinnedFetchImage('https://example.test/image', {
        // eslint-disable-next-line sonarjs/no-hardcoded-ip -- pinned transport fixture
        pinnedAddresses: ['8.8.8.8'],
      }),
    ).rejects.toThrow('socket failed');
  });
});
