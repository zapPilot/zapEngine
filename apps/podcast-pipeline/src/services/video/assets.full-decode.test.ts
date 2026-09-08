import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { acquireRemoteImage } from './assets.js';

describe('acquireRemoteImage full decode validation', () => {
  it('rejects a truncated PNG that still exposes readable metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'podcast-image-decode-'));
    try {
      const validPng = await sharp({
        create: {
          width: 1_200,
          height: 900,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer();
      const truncatedPng = validPng.subarray(0, validPng.length - 32);

      await expect(
        sharp(truncatedPng, { failOn: 'error' }).metadata(),
      ).resolves.toMatchObject({ width: 1_200, height: 900, format: 'png' });

      await expect(
        acquireRemoteImage('https://example.test/truncated.png', {
          workingDirectory: directory,
          filename: 'truncated',
          fetchImage: async () =>
            new Response(Uint8Array.from(truncatedPng), {
              status: 200,
              headers: { 'content-type': 'image/png' },
            }),
          // eslint-disable-next-line sonarjs/no-hardcoded-ip -- test stub for DNS resolution
          resolveHost: async () => ['8.8.8.8'],
        }),
      ).rejects.toThrow(/libpng read error|pngload/iu);

      await expect(stat(join(directory, 'truncated.image'))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
