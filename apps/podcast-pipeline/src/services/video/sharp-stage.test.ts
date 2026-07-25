import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { runSharpCropStage, runSharpScaleStage } from './sharp-stage.js';

let temporaryDirectory: string | null = null;

async function createTestDirectory(): Promise<string> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'sharp-stage-test-'));
  return temporaryDirectory;
}

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('runSharpScaleStage', () => {
  it('halves a 2x master to its output size and keeps the alpha channel', async () => {
    const directory = await createTestDirectory();
    const masterPath = join(directory, 'master.png');
    const outputPath = join(directory, 'output.png');
    await sharp({
      create: {
        width: 432,
        height: 768,
        channels: 4,
        background: { r: 16, g: 16, b: 20, alpha: 0 },
      },
    })
      .png()
      .toFile(masterPath);

    await runSharpScaleStage(masterPath, outputPath);

    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(216);
    expect(metadata.height).toBe(384);
    expect(metadata.hasAlpha).toBe(true);
    const stats = await sharp(outputPath).stats();
    expect(stats.channels[3]?.max).toBe(0);
  });

  it('rejects a master whose dimensions cannot be read', async () => {
    const directory = await createTestDirectory();
    const bogusPath = join(directory, 'bogus.png');
    await writeFile(bogusPath, 'not a png', 'utf8');
    await expect(
      runSharpScaleStage(bogusPath, join(directory, 'out.png')),
    ).rejects.toThrow();
  });
});

describe('runSharpCropStage', () => {
  it('cover-crops a landscape image into the requested window', async () => {
    const directory = await createTestDirectory();
    const imagePath = join(directory, 'source.png');
    const cropInputPath = join(directory, 'crop.json');
    const outputPath = join(directory, 'crop.png');
    await sharp({
      create: {
        width: 400,
        height: 100,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toFile(imagePath);
    await writeFile(
      cropInputPath,
      JSON.stringify({
        imagePath,
        width: 108,
        height: 96,
        position: 'center',
      }),
      'utf8',
    );

    await runSharpCropStage(cropInputPath, outputPath);

    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(108);
    expect(metadata.height).toBe(96);
  });

  it('rejects crop inputs that are missing the image path or size', async () => {
    const directory = await createTestDirectory();
    const cropInputPath = join(directory, 'crop.json');
    await writeFile(
      cropInputPath,
      JSON.stringify({ width: 10, height: 10, position: 'center' }),
      'utf8',
    );
    await expect(
      runSharpCropStage(cropInputPath, join(directory, 'out.png')),
    ).rejects.toThrow('Sharp crop stage input is missing imagePath or size');
  });
});
