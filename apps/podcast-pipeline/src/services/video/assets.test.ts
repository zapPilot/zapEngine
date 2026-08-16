import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  acquireRemoteImage,
  createPinnedLookup,
  type FetchImage,
  isPublicIpAddress,
  pinnedFetchImage,
  resolveSlideAsset,
} from './assets.js';
import type { Slide, SlideSource } from './manifest.js';

// Hardcoded IP literals are the subject under test here, not a deployment risk.
/* eslint-disable sonarjs/no-hardcoded-ip */
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'assets-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

const openSource: SlideSource = {
  id: 'open-image',
  label: 'Open image fixture',
  url: 'https://example.test/source',
  attribution: 'Fixture Author · CC0',
  license: 'cc0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

function hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function imageResponse(
  buffer: Buffer,
  options: {
    contentType?: string;
    contentLength?: number;
    status?: number;
  } = {},
): Response {
  const status = options.status ?? 200;
  return new Response(Uint8Array.from(buffer), {
    status,
    headers: {
      'content-type': options.contentType ?? 'image/png',
      'content-length': String(options.contentLength ?? buffer.byteLength),
    },
  });
}

function remoteImageSlide(options: {
  imageHash: string;
  layout?: 'fullBleed' | 'framed';
  sourceId?: string;
  url?: string;
}): Extract<Slide, { template: 'photoFact' }> {
  return {
    id: 'remote-image',
    startMs: 0,
    endMs: 4_000,
    template: 'photoFact',
    eyebrow: 'IMAGE',
    headline: 'Remote image',
    facts: ['Verified dimensions'],
    sources: [openSource],
    asset: {
      kind: 'remoteImage',
      sourceId: options.sourceId ?? openSource.id,
      url: options.url ?? 'https://example.test/image.png',
      sha256: options.imageHash,
      layout: options.layout ?? 'framed',
      position: 'center',
    },
  };
}

function bundledMapSlide(
  sourceId: string = openSource.id,
): Extract<Slide, { template: 'sourceQuote' }> {
  return {
    id: 'pjm-map',
    startMs: 0,
    endMs: 4_000,
    template: 'sourceQuote',
    eyebrow: 'PJM',
    quote: '13 states and Washington, D.C.',
    citation: 'PJM',
    sources: [openSource],
    asset: {
      kind: 'bundledMap',
      sourceId,
      key: 'us-states-cc0',
      layout: 'framed',
      highlightRegionIds: ['pa', 'nj', 'dc'],
    },
  };
}

describe('resolveSlideAsset', () => {
  it('returns an attributed editorial fallback when a slide has no image', async () => {
    const slide: Extract<Slide, { template: 'cover' }> = {
      id: 'cover',
      startMs: 0,
      endMs: 4_000,
      template: 'cover',
      kicker: 'NEWS',
      headline: 'Static slides',
      subheadline: 'No synthetic news image',
      sources: [openSource],
      asset: { kind: 'none' },
    };

    await expect(resolveSlideAsset(slide)).resolves.toEqual({
      kind: 'fallback',
      reason: 'Source-first editorial card; no photograph used',
      source: openSource,
    });
  });

  it.each([
    { layout: 'framed' as const, width: 800, height: 450 },
    { layout: 'fullBleed' as const, width: 1_600, height: 900 },
  ])(
    'accepts a $layout image at its minimum long-edge size',
    async ({ layout, width, height }) => {
      const buffer = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: '#d4c5a3',
        },
      })
        .png()
        .toBuffer();
      const fetchImage = vi.fn(async () => imageResponse(buffer));

      const resolved = await resolveSlideAsset(
        remoteImageSlide({ imageHash: hash(buffer), layout }),
        fetchImage,
      );

      expect(resolved).toMatchObject({
        kind: 'image',
        layout,
        position: 'center',
        width,
        height,
        source: openSource,
      });
      if (resolved.kind !== 'image') {
        throw new Error('Expected a resolved image fixture');
      }
      expect(resolved.dataUri).toMatch(/^data:image\/png;base64,/);
      expect(fetchImage).toHaveBeenCalledWith(
        'https://example.test/image.png',
        expect.objectContaining({ redirect: 'manual' }),
      );
    },
  );

  it.each([
    { layout: 'framed' as const, width: 799, required: 800 },
    { layout: 'fullBleed' as const, width: 999, required: 1_000 },
  ])(
    'falls back when a $layout image is below its quality floor',
    async ({ layout, width, required }) => {
      const buffer = await sharp({
        create: {
          width,
          height: 20,
          channels: 3,
          background: '#0a0a0a',
        },
      })
        .png()
        .toBuffer();

      const resolved = await resolveSlideAsset(
        remoteImageSlide({ imageHash: hash(buffer), layout }),
        async () => imageResponse(buffer),
      );

      expect(resolved).toMatchObject({
        kind: 'fallback',
        source: openSource,
      });
      if (resolved.kind !== 'fallback') {
        throw new Error('Expected a dimension fallback');
      }
      expect(resolved.reason).toContain(
        `${layout} image long edge is ${width}px; ${required}px is required`,
      );
    },
  );

  it('rejects a full-bleed image below the 800px short-edge floor', async () => {
    const buffer = await sharp({
      create: {
        width: 1_600,
        height: 799,
        channels: 3,
        background: '#0a0a0a',
      },
    })
      .png()
      .toBuffer();

    const resolved = await resolveSlideAsset(
      remoteImageSlide({
        imageHash: hash(buffer),
        layout: 'fullBleed',
      }),
      async () => imageResponse(buffer),
    );

    expect(resolved).toMatchObject({ kind: 'fallback' });
    if (resolved.kind !== 'fallback') {
      throw new Error('Expected a short-edge dimension fallback');
    }
    expect(resolved.reason).toContain(
      'fullBleed image short edge is 799px; 800px is required',
    );
  });

  it('falls back when the downloaded bytes do not match the manifest hash', async () => {
    const buffer = await sharp({
      create: {
        width: 800,
        height: 20,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    const resolved = await resolveSlideAsset(
      remoteImageSlide({ imageHash: '0'.repeat(64) }),
      async () => imageResponse(buffer),
    );

    expect(resolved).toMatchObject({
      kind: 'fallback',
      reason: 'Image fallback: Image SHA-256 does not match the manifest',
      source: openSource,
    });
  });

  it.each([
    {
      label: 'HTTP failure',
      response: () => imageResponse(Buffer.from('missing'), { status: 404 }),
      message: 'Image request failed with HTTP 404',
    },
    {
      label: 'non-image response',
      response: () =>
        imageResponse(Buffer.from('html'), { contentType: 'text/html' }),
      message: 'Remote asset is not an image',
    },
    {
      label: 'oversized declaration',
      response: () =>
        imageResponse(Buffer.from('image'), {
          contentLength: 25 * 1024 * 1024 + 1,
        }),
      message: 'Image exceeds the 25 MiB download limit',
    },
  ])('falls back for a $label', async ({ response, message }) => {
    const resolved = await resolveSlideAsset(
      remoteImageSlide({ imageHash: '0'.repeat(64) }),
      async () => response(),
    );

    expect(resolved).toMatchObject({ kind: 'fallback', source: openSource });
    if (resolved.kind !== 'fallback') {
      throw new Error('Expected an HTTP metadata fallback');
    }
    expect(resolved.reason).toContain(message);
  });

  it('falls back when image metadata cannot be decoded', async () => {
    const buffer = Buffer.from('not-a-real-image');
    const resolved = await resolveSlideAsset(
      remoteImageSlide({ imageHash: hash(buffer) }),
      async () => imageResponse(buffer),
    );

    expect(resolved).toMatchObject({ kind: 'fallback', source: openSource });
    if (resolved.kind !== 'fallback') {
      throw new Error('Expected an image metadata fallback');
    }
    expect(resolved.reason).toContain('Image fallback:');
  });

  it('falls back before fetching when remote attribution is missing', async () => {
    const fetchImage = vi.fn();
    const resolved = await resolveSlideAsset(
      remoteImageSlide({
        imageHash: '0'.repeat(64),
        sourceId: 'missing-source',
      }),
      fetchImage,
    );

    expect(resolved).toEqual({
      kind: 'fallback',
      reason: 'Image attribution is missing',
      source: null,
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('loads the bundled CC0 map and applies deterministic PJM highlighting', async () => {
    const resolved = await resolveSlideAsset(bundledMapSlide());

    expect(resolved).toMatchObject({
      kind: 'image',
      layout: 'framed',
      position: 'center',
      width: 959,
      height: 593,
      source: openSource,
    });
    if (resolved.kind !== 'image') {
      throw new Error('Expected a resolved bundled map');
    }
    expect(resolved.dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    if (!resolved.dataUri) throw new Error('Expected bundled map data URI');
    const svg = Buffer.from(resolved.dataUri.split(',')[1]!, 'base64').toString(
      'utf8',
    );
    expect(svg).toContain('.pa,.nj,.dc { fill: #d4c5a3; }');
    expect(svg).toContain('.state { fill: #18181b; }');
    expect(svg).toContain('class="pa"');
  });

  it('writes bundled maps and remote images to a caller-owned working directory', async () => {
    const directory = await tempDirectory();
    const map = await resolveSlideAsset(bundledMapSlide(), {
      workingDirectory: directory,
    });
    expect(map).toMatchObject({
      kind: 'image',
      dataUri: undefined,
      filePath: join(directory, 'pjm-map.svg'),
    });
    expect((await stat(join(directory, 'pjm-map.svg'))).size).toBeGreaterThan(
      0,
    );

    const buffer = await sharp({
      create: {
        width: 800,
        height: 450,
        channels: 3,
        background: '#d4c5a3',
      },
    })
      .png()
      .toBuffer();
    const remote = await resolveSlideAsset(
      remoteImageSlide({
        imageHash: hash(buffer),
        url: 'https://example.test/image',
      }),
      {
        workingDirectory: directory,
        fetchImage: async () => imageResponse(buffer),
        resolveHost: async () => ['8.8.8.8'],
      },
    );
    expect(remote).toMatchObject({
      kind: 'image',
      filePath: join(directory, 'remote-image.image'),
    });
    expect(remote).not.toHaveProperty('dataUri');
    expect(await readFile(join(directory, 'remote-image.image'))).toEqual(
      buffer,
    );
  });

  it('uses null source for source-free editorial slides', async () => {
    const slide: Extract<Slide, { template: 'cover' }> = {
      id: 'cover-empty',
      startMs: 0,
      endMs: 1_000,
      template: 'cover',
      kicker: 'NEWS',
      headline: 'No source',
      subheadline: '',
      sources: [],
      asset: { kind: 'none' },
    };
    await expect(resolveSlideAsset(slide)).resolves.toMatchObject({
      kind: 'fallback',
      source: null,
    });
  });

  it('falls back when bundled-map attribution is missing', async () => {
    await expect(
      resolveSlideAsset(bundledMapSlide('missing-source')),
    ).resolves.toEqual({
      kind: 'fallback',
      reason: 'Map attribution is missing',
      source: null,
    });
  });
});

describe('DNS pinning', () => {
  async function pngBuffer(): Promise<Buffer> {
    return sharp({
      create: { width: 800, height: 450, channels: 3, background: '#d4c5a3' },
    })
      .png()
      .toBuffer();
  }

  it('pins the fetch to the addresses validated in the same resolution', async () => {
    const buffer = await pngBuffer();
    // Simulated DNS rebinding: the second resolution would return loopback.
    // A single validated resolution must be reused for the connection.
    const resolveHost = vi
      .fn<(hostname: string) => Promise<string[]>>()
      .mockResolvedValueOnce(['93.184.216.34'])
      .mockResolvedValue(['127.0.0.1']);
    const fetchImage = vi.fn(async () => imageResponse(buffer));

    const resolved = await resolveSlideAsset(
      remoteImageSlide({ imageHash: hash(buffer) }),
      { fetchImage, resolveHost },
    );

    expect(resolved).toMatchObject({ kind: 'image' });
    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(fetchImage).toHaveBeenCalledWith(
      'https://example.test/image.png',
      expect.objectContaining({ pinnedAddresses: ['93.184.216.34'] }),
    );
  });

  it('re-validates and pins each redirect hop to its own resolution', async () => {
    const buffer = await pngBuffer();
    const resolveHost = vi.fn(async (hostname: string) =>
      hostname === 'cdn.example.test' ? ['151.101.1.140'] : ['93.184.216.34'],
    );
    const fetchImage = vi
      .fn<FetchImage>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.test/image.png' },
        }),
      )
      .mockResolvedValueOnce(imageResponse(buffer));

    const resolved = await resolveSlideAsset(
      remoteImageSlide({ imageHash: hash(buffer) }),
      { fetchImage, resolveHost },
    );

    expect(resolved).toMatchObject({ kind: 'image' });
    expect(resolveHost).toHaveBeenCalledTimes(2);
    expect(fetchImage).toHaveBeenNthCalledWith(
      1,
      'https://example.test/image.png',
      expect.objectContaining({ pinnedAddresses: ['93.184.216.34'] }),
    );
    expect(fetchImage).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.test/image.png',
      expect.objectContaining({ pinnedAddresses: ['151.101.1.140'] }),
    );
  });

  it('rejects unsafe remote URL boundaries before fetching', async () => {
    const fetchImage = vi.fn<FetchImage>();
    const cases = [
      {
        url: 'http://example.test/image.png',
        resolveHost: async () => ['8.8.8.8'],
        message: 'must use HTTPS',
      },
      {
        url: 'https://user:pass@example.test/image.png',
        resolveHost: async () => ['8.8.8.8'],
        message: 'must not contain credentials',
      },
      {
        url: 'https://example.test/image.png',
        resolveHost: async () => [],
        message: 'private or reserved IP',
      },
      {
        url: 'https://example.test/image.png',
        resolveHost: async () => ['8.8.8.8', '127.0.0.1'],
        message: 'private or reserved IP',
      },
      {
        url: 'https://127.0.0.1/image.png',
        resolveHost: async () => ['8.8.8.8'],
        message: 'private or reserved IP',
      },
    ];

    for (const testCase of cases) {
      const result = await resolveSlideAsset(
        remoteImageSlide({ imageHash: '0'.repeat(64), url: testCase.url }),
        { fetchImage, resolveHost: testCase.resolveHost },
      );
      expect(result).toMatchObject({ kind: 'fallback' });
      if (result.kind === 'fallback')
        expect(result.reason).toContain(testCase.message);
    }
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it('pins a public literal IP without performing DNS resolution', async () => {
    const buffer = await pngBuffer();
    const resolveHost = vi.fn(async () => ['127.0.0.1']);
    const fetchImage = vi.fn(async () => imageResponse(buffer));
    const result = await resolveSlideAsset(
      remoteImageSlide({
        imageHash: hash(buffer),
        url: 'https://8.8.8.8/image.png',
      }),
      { fetchImage, resolveHost },
    );

    expect(result).toMatchObject({ kind: 'image' });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(fetchImage).toHaveBeenCalledWith(
      'https://8.8.8.8/image.png',
      expect.objectContaining({ pinnedAddresses: ['8.8.8.8'] }),
    );
  });

  it('fails closed when DNS resolution is aborted', async () => {
    const controller = new AbortController();
    const leaseError = new Error('lease lost');
    const resolveHost = vi.fn(
      async () =>
        new Promise<string[]>(() => {
          // Intentionally unresolved; abort must win the race.
        }),
    );
    const result = resolveSlideAsset(
      remoteImageSlide({ imageHash: '0'.repeat(64) }),
      {
        fetchImage: vi.fn(),
        resolveHost,
        signal: controller.signal,
      },
    );
    await vi.waitFor(() => expect(resolveHost).toHaveBeenCalledOnce());
    controller.abort(leaseError);
    await expect(result).rejects.toThrow('lease lost');
  });

  it('enforces the redirect limit and cancels redirect bodies', async () => {
    const cancel = vi.fn(async () => undefined);
    const redirectResponse = (): Response => {
      const response = new Response('redirect', {
        status: 302,
        headers: { location: '/next.png' },
      });
      Object.defineProperty(response.body, 'cancel', { value: cancel });
      return response;
    };
    const fetchImage = vi.fn(async () => redirectResponse());

    const result = await resolveSlideAsset(
      remoteImageSlide({ imageHash: '0'.repeat(64) }),
      { fetchImage, resolveHost: async () => ['8.8.8.8'] },
    );

    expect(result).toMatchObject({ kind: 'fallback' });
    if (result.kind === 'fallback') {
      expect(result.reason).toContain('3-redirect limit');
    }
    expect(fetchImage).toHaveBeenCalledTimes(4);
    expect(cancel).toHaveBeenCalledTimes(4);
  });

  it('createPinnedLookup answers with the validated addresses, never DNS', () => {
    const lookup = createPinnedLookup([
      '93.184.216.34',
      '2606:2800:220:1:248:1893:25c8:1946',
    ]);

    const single = vi.fn();
    lookup('attacker-rebind.example', {}, single);
    expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const all = vi.fn();
    lookup('attacker-rebind.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);

    const empty = createPinnedLookup([]);
    const missing = vi.fn();
    empty('example.test', {}, missing);
    expect(missing.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it('pinnedFetchImage refuses to connect without pre-validated addresses', async () => {
    await expect(
      pinnedFetchImage('https://example.test/image.png'),
    ).rejects.toThrow(/pinned/i);
    await expect(
      pinnedFetchImage('https://example.test/image.png', {
        pinnedAddresses: [],
      }),
    ).rejects.toThrow(/pinned/i);
  });
});

describe('acquireRemoteImage', () => {
  it('rejects unsafe filenames before creating output', async () => {
    const directory = await tempDirectory();
    await expect(
      acquireRemoteImage('https://example.test/image.png', {
        workingDirectory: directory,
        filename: '../escape',
        fetchImage: vi.fn(),
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toThrow('unsafe characters');
  });

  it('accepts image/jpg, defaults to framed layout, and handles missing content-length', async () => {
    const directory = await tempDirectory();
    const buffer = await sharp({
      create: {
        width: 800,
        height: 450,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();
    const result = await acquireRemoteImage('https://example.test/photo.jpg', {
      workingDirectory: directory,
      filename: 'photo',
      fetchImage: async () =>
        new Response(Uint8Array.from(buffer), {
          status: 200,
          headers: { 'content-type': 'image/jpg; charset=binary' },
        }),
      resolveHost: async () => ['8.8.8.8'],
    });

    expect(result).toMatchObject({
      contentType: 'image/jpeg',
      width: 800,
      height: 450,
      sha256: hash(buffer),
    });
    expect((await stat(result.path)).size).toBe(buffer.length);
  });

  it('removes downloaded files when decoded format or dimensions are unsafe', async () => {
    const directory = await tempDirectory();
    const png = await sharp({
      create: { width: 800, height: 450, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(
      acquireRemoteImage('https://example.test/mismatch.jpg', {
        workingDirectory: directory,
        filename: 'mismatch',
        fetchImage: async () =>
          imageResponse(png, { contentType: 'image/jpeg' }),
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toThrow('content type does not match decoded format');
    await expect(stat(join(directory, 'mismatch.image'))).rejects.toThrow();

    const wide = await sharp({
      create: {
        width: 16_385,
        height: 1,
        channels: 3,
        background: '#fff',
      },
    })
      .png()
      .toBuffer();
    await expect(
      acquireRemoteImage('https://example.test/wide.png', {
        workingDirectory: directory,
        filename: 'wide',
        fetchImage: async () => imageResponse(wide),
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toThrow('safe pixel-dimension limit');
    await expect(stat(join(directory, 'wide.image'))).rejects.toThrow();
  });

  it('rejects successful HTTP responses with no body', async () => {
    const directory = await tempDirectory();
    await expect(
      acquireRemoteImage('https://example.test/empty.png', {
        workingDirectory: directory,
        filename: 'empty',
        fetchImage: async () =>
          new Response(null, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
        resolveHost: async () => ['8.8.8.8'],
      }),
    ).rejects.toThrow('Image response body is empty');
  });
});

describe('isPublicIpAddress', () => {
  it('treats routable addresses as public', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPublicIpAddress(address)).toBe(true);
    }
  });

  it('rejects private and reserved IPv4 ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '100.127.255.255',
      '192.0.0.1',
      '198.18.0.1',
      '198.19.255.255',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '255.255.255.255',
      '0.0.0.0',
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });

  it('accepts public boundary neighbors and mapped public IPv6', () => {
    for (const address of [
      '100.63.255.255',
      '100.128.0.1',
      '172.15.255.255',
      '172.32.0.1',
      '192.167.255.255',
      '198.17.255.255',
      '198.20.0.1',
      '::ffff:8.8.8.8',
      '::8.8.8.8',
      '2001:4860:4860::8888',
      '2001:4860:4860:0:0:0:0:8888',
    ]) {
      expect(isPublicIpAddress(address)).toBe(true);
    }
    expect(isPublicIpAddress('not-an-ip')).toBe(false);
  });

  it('rejects every reserved IPv6 routing family and mapped private IPv4', () => {
    for (const address of [
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '2002::1',
      '64:ff9b::808:808',
      '::192.168.1.1',
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });

  it('rejects loopback and mapped IPv6 literals regardless of textual form', () => {
    for (const address of [
      '::1',
      '0:0:0:0:0:0:0:1', // fully-expanded loopback
      '::ffff:127.0.0.1', // dotted IPv4-mapped loopback
      '::ffff:7f00:1', // hex IPv4-mapped loopback
      '::ffff:169.254.169.254', // IPv4-mapped link-local metadata endpoint
      'fe80::1', // link-local
      'fc00::1', // unique local
      'fd12:3456::1', // unique local
      'ff02::1', // multicast
      '::', // unspecified
      '64:ff9b::7f00:1', // NAT64-embedded loopback
      '64:ff9b::a9fe:a9fe', // NAT64-embedded metadata endpoint
      '2002:7f00:1::', // 6to4-embedded loopback
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });
});
/* eslint-enable sonarjs/no-hardcoded-ip */
