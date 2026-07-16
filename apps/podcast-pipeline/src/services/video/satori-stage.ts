import { readFile, writeFile } from 'node:fs/promises';

import satori from 'satori';

import type { ResolvedSlideAsset } from './assets.js';
import {
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  RASTER_SCALE,
  type Slide,
} from './manifest.js';
import { videoAssetPaths } from './runtime-assets.js';
import { renderSlideElement } from './templates.js';

interface SatoriStageInput {
  slide: Slide;
  asset: ResolvedSlideAsset;
}

function fontArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function svgDataUri(svg: Buffer): string {
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

async function materializeAssetDataUri(
  asset: ResolvedSlideAsset,
): Promise<ResolvedSlideAsset> {
  if (asset.kind !== 'image' || asset.dataUri) return asset;
  if (!asset.filePath) {
    throw new Error('Resolved image asset has neither dataUri nor filePath');
  }

  const bytes = await readFile(asset.filePath);
  return {
    ...asset,
    dataUri: `data:${asset.contentType};base64,${bytes.toString('base64')}`,
  };
}

export async function runSatoriStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const input = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as SatoriStageInput;
  const [regularFont, boldFont, monoFont, logo] = await Promise.all([
    readFile(videoAssetPaths.notoSansCjkTcRegular),
    readFile(videoAssetPaths.notoSansCjkTcBold),
    readFile(videoAssetPaths.jetBrainsMonoSemibold),
    readFile(videoAssetPaths.logo),
  ]);
  const asset = await materializeAssetDataUri(input.asset);

  const element = renderSlideElement(input.slide, asset, svgDataUri(logo));
  const svg = await satori(element, {
    width: OUTPUT_WIDTH * RASTER_SCALE,
    height: OUTPUT_HEIGHT * RASTER_SCALE,
    embedFont: true,
    fonts: [
      {
        name: 'Noto Sans TC',
        data: fontArrayBuffer(regularFont),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Noto Sans TC',
        data: fontArrayBuffer(boldFont),
        weight: 700,
        style: 'normal',
      },
      {
        name: 'JetBrains Mono',
        data: fontArrayBuffer(monoFont),
        weight: 700,
        style: 'normal',
      },
    ],
  });

  await writeFile(outputPath, svg, 'utf8');
}
