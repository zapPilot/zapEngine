import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import type { ResolvedSlideAsset } from './assets.js';
import type { ImageSlide, SlideSource } from './manifest.js';
import { runResvgStage } from './resvg-stage.js';
import { runSatoriStage } from './satori-stage.js';
import { runSharpStage } from './sharp-stage.js';
import { renderSlideElement } from './templates.js';

const source = {
  id: 'scene-source',
  label: 'Source label must stay invisible',
  url: 'https://news.example.test/story',
  attribution: 'Attribution must stay invisible',
  license: 'unknown',
  licenseUrl: null,
} satisfies SlideSource;

const slide = {
  id: 'scene-01',
  startMs: 0,
  endMs: 10_000,
  template: 'image',
  sources: [source],
  asset: {
    kind: 'remoteImage',
    sourceId: source.id,
    url: 'https://images.example.test/scene.jpg',
    sha256: 'a'.repeat(64),
    layout: 'fullBleed',
    position: 'center',
  },
} satisfies ImageSlide;

const imageDataUri =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><rect width="3840" height="2160" fill="#315b48"/></svg>',
  ).toString('base64');

const imageAsset = {
  kind: 'image',
  dataUri: imageDataUri,
  contentType: 'image/svg+xml',
  layout: 'fullBleed',
  position: 'center',
  width: 3_840,
  height: 2_160,
  source,
} satisfies ResolvedSlideAsset;

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('image-only slide template', () => {
  it('dispatches v2 scenes to the full-frame image layout', () => {
    const element = renderSlideElement(
      slide,
      imageAsset,
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    expect(typeof element.type === 'function' ? element.type.name : '').toBe(
      'ImageTemplate',
    );
  });

  it('rejects a text-card fallback instead of rendering it', () => {
    const element = renderSlideElement(
      slide,
      {
        kind: 'fallback',
        reason: 'download failed',
        source,
      },
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    if (typeof element.type !== 'function') {
      throw new Error('Expected image template component');
    }
    const renderComponent = element.type as unknown as (
      props: unknown,
    ) => unknown;
    expect(() => renderComponent(element.props)).toThrow(
      'Scene scene-01 requires a resolved remote image',
    );
  });
});

describe('native image raster stages', () => {
  it.each([
    { contentType: 'image/avif', format: 'avif' as const },
    { contentType: 'image/webp', format: 'webp' as const },
  ])(
    'normalizes $contentType scene assets to PNG before Satori renders them',
    async ({ contentType, format }) => {
      temporaryDirectory = await mkdtemp(
        join(tmpdir(), 'podcast-image-normalize-'),
      );
      const imagePath = join(temporaryDirectory, `scene.${format}`);
      const inputPath = join(temporaryDirectory, 'scene.json');
      const svgPath = join(temporaryDirectory, 'scene.svg');
      const image = sharp({
        create: {
          width: 96,
          height: 54,
          channels: 3,
          background: '#315b48',
        },
      });
      await (format === 'avif' ? image.avif() : image.webp()).toFile(imagePath);
      await writeFile(
        inputPath,
        JSON.stringify({
          slide,
          asset: {
            ...imageAsset,
            dataUri: undefined,
            filePath: imagePath,
            contentType,
            width: 96,
            height: 54,
          },
        }),
        'utf8',
      );

      await runSatoriStage(inputPath, svgPath);

      const svg = await readFile(svgPath, 'utf8');
      expect(svg).toContain('data:image/png;base64,');
      expect(svg).not.toContain(`data:${contentType};base64,`);
    },
    120_000,
  );

  it('fills the 4K frame with the image and Zap logo, without source copy', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'podcast-image-raster-'));
    const inputPath = join(temporaryDirectory, 'scene.json');
    const svgPath = join(temporaryDirectory, 'scene.svg');
    const masterPath = join(temporaryDirectory, 'scene-master.png');
    const outputPath = join(temporaryDirectory, 'scene-1080p.png');

    await writeFile(
      inputPath,
      JSON.stringify({ slide, asset: imageAsset }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);

    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="3840"');
    expect(svg).toContain('height="2160"');
    expect(svg).not.toContain(source.label);
    expect(svg).not.toContain(source.attribution);

    await runResvgStage(svgPath, masterPath);
    await expect(sharp(masterPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 3_840,
      height: 2_160,
    });

    await runSharpStage(masterPath, outputPath);
    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 1_920,
      height: 1_080,
    });
  }, 120_000);
});
