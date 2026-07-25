import { createHash } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import {
  createPinnedLookup,
  type FetchImage,
  isPublicIpAddress,
  pinnedFetchImage,
  resolveSlideAsset,
} from './assets.js';
import type { Slide, SlideSource } from './manifest.js';

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
      url: 'https://example.test/image.png',
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

// Hardcoded IP literals are the subject under test here, not a deployment risk.
/* eslint-disable sonarjs/no-hardcoded-ip */
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
      '0.0.0.0',
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
