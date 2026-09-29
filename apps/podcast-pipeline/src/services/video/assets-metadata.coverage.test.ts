import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  metadata: {},
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => {
    const pipeline = {
      metadata: vi.fn().mockImplementation(async () => mocks.metadata),
      resize: vi.fn(),
      raw: vi.fn(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from([1])),
    };
    pipeline.resize.mockReturnValue(pipeline);
    pipeline.raw.mockReturnValue(pipeline);
    return pipeline;
  }),
}));

import { acquireRemoteImage } from './assets.js';

const directories: string[] = [];

beforeEach(() => {
  mocks.metadata = {};
});

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function acquireWithMetadata(metadata: Record<string, unknown>) {
  mocks.metadata = metadata;
  const directory = await mkdtemp(join(tmpdir(), 'assets-metadata-'));
  directories.push(directory);
  return acquireRemoteImage('https://example.test/image', {
    workingDirectory: directory,
    filename: 'image',
    fetchImage: async () =>
      new Response(Uint8Array.from([1, 2, 3]), { status: 200 }),
    // eslint-disable-next-line sonarjs/no-hardcoded-ip -- deterministic public DNS fixture
    resolveHost: async () => ['8.8.8.8'],
  });
}

describe('remote image metadata coverage', () => {
  it('rejects metadata without dimensions', async () => {
    await expect(acquireWithMetadata({ format: 'png' })).rejects.toThrow(
      'Image dimensions could not be read',
    );
  });

  it('rejects animated or multi-page images', async () => {
    await expect(
      acquireWithMetadata({ width: 800, height: 450, pages: 2, format: 'png' }),
    ).rejects.toThrow('Animated or multi-page images are not supported');
  });

  it('rejects HEIF unless libvips identifies AV1 compression', async () => {
    await expect(
      acquireWithMetadata({
        width: 800,
        height: 450,
        pages: 1,
        format: 'heif',
        compression: 'hevc',
      }),
    ).rejects.toThrow('unsupported raster format');
  });
});
