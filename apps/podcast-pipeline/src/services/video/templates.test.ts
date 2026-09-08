import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ReactElement } from 'react';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { runResvgStage } from './resvg-stage.js';
import { runSatoriStage } from './satori-stage.js';
import { runSharpScaleStage } from './sharp-stage.js';
import { renderBrandFrameElement, renderOutroElement } from './templates.js';

const LOGO_DATA_URI = 'data:image/svg+xml;base64,PHN2Zy8+';

function componentName(element: ReactElement): string {
  return typeof element.type === 'function'
    ? ((element.type as { name?: string }).name ?? '')
    : '';
}

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe('vertical brand frame and outro templates', () => {
  it('dispatches headline and outro content to the portrait components', () => {
    const frameElement = renderBrandFrameElement(
      { kicker: '鏈上快訊', titleLines: ['世界盃最賺錢的生意'] },
      LOGO_DATA_URI,
    );
    expect(componentName(frameElement)).toBe('BrandFrameTemplate');

    const outroElement = renderOutroElement(
      { title: 'From Fed to Chain', callToAction: '訂閱・分享・留言' },
      LOGO_DATA_URI,
    );
    expect(componentName(outroElement)).toBe('OutroTemplate');
  });

  it('rasterizes the brand frame at 720x1280 with a transparent media window', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'brand-frame-raster-'));
    const inputPath = join(temporaryDirectory, 'frame.json');
    const svgPath = join(temporaryDirectory, 'frame.svg');
    const masterPath = join(temporaryDirectory, 'frame-master.png');
    const outputPath = join(temporaryDirectory, 'frame.png');
    const scaleInputPath = join(temporaryDirectory, 'frame-scale.json');

    await writeFile(
      inputPath,
      JSON.stringify({
        kind: 'frame',
        frame: {
          kicker: '鏈上快訊',
          titleLines: ['世界盃最賺錢的生意', '暴漲三百倍'],
        },
        output: { width: 720, height: 1280 },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);

    const svg = await readFile(svgPath, 'utf8');
    expect(svg).toContain('width="2160"');
    expect(svg).toContain('height="3840"');

    await runResvgStage(svgPath, masterPath);
    await writeFile(
      scaleInputPath,
      JSON.stringify({ imagePath: masterPath, width: 720, height: 1280 }),
      'utf8',
    );
    await runSharpScaleStage(scaleInputPath, outputPath);
    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 720,
      height: 1280,
    });

    // sharp's stats() reads the ORIGINAL input, ignoring chained operations —
    // materialize each extracted region to a buffer before measuring alpha.
    const regionStats = async (top: number, height: number) => {
      const region = await sharp(outputPath)
        .extract({ left: 0, top, width: 720, height })
        .png()
        .toBuffer();
      return sharp(region).stats();
    };

    const mediaWindow = await regionStats(427, 613);
    expect(mediaWindow.channels[3]?.max).toBe(0);

    const topBand = await regionStats(0, 400);
    expect(topBand.channels[3]?.min).toBe(255);

    const bottomBand = await regionStats(1_067, 200);
    expect(bottomBand.channels[3]?.min).toBe(255);
  }, 120_000);

  it('rasterizes the outro card fully opaque at 720x1280', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'outro-raster-'));
    const inputPath = join(temporaryDirectory, 'outro.json');
    const svgPath = join(temporaryDirectory, 'outro.svg');
    const masterPath = join(temporaryDirectory, 'outro-master.png');
    const outputPath = join(temporaryDirectory, 'outro.png');
    const scaleInputPath = join(temporaryDirectory, 'outro-scale.json');

    await writeFile(
      inputPath,
      JSON.stringify({
        kind: 'outro',
        outro: { title: 'From Fed to Chain', callToAction: '訂閱・分享・留言' },
        output: { width: 720, height: 1280 },
      }),
      'utf8',
    );
    await runSatoriStage(inputPath, svgPath);
    await runResvgStage(svgPath, masterPath);
    await writeFile(
      scaleInputPath,
      JSON.stringify({ imagePath: masterPath, width: 720, height: 1280 }),
      'utf8',
    );
    await runSharpScaleStage(scaleInputPath, outputPath);

    await expect(sharp(outputPath).metadata()).resolves.toMatchObject({
      format: 'png',
      width: 720,
      height: 1280,
    });
    const stats = await sharp(outputPath).stats();
    const alpha = stats.channels[3];
    if (alpha) expect(alpha.min).toBe(255);
  }, 120_000);
});
