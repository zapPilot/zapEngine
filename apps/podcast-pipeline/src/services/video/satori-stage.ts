import { readFile, writeFile } from 'node:fs/promises';

import satori from 'satori';
import sharp from 'sharp';

import type { ResolvedSlideAsset } from './assets.js';
import {
  LANDSCAPE_OUTPUT_HEIGHT,
  LANDSCAPE_OUTPUT_WIDTH,
  PORTRAIT_OUTPUT_HEIGHT,
  PORTRAIT_OUTPUT_WIDTH,
  RASTER_SCALE,
  type Slide,
} from './manifest.js';
import { videoAssetPaths } from './runtime-assets.js';
import {
  type BrandFrameContent,
  type OutroContent,
  renderBrandFrameElement,
  renderOutroElement,
  renderSlideElement,
} from './templates.js';

// Slides keep the frozen landscape canvas that stored v1/v2 templates were
// designed for; the portrait brand frame and outro card are the only stage
// kinds rendered at the 9:16 canvas.
export type SatoriStageInput =
  | { kind?: 'slide'; slide: Slide; asset: ResolvedSlideAsset }
  | { kind: 'frame'; frame: BrandFrameContent }
  | { kind: 'outro'; outro: OutroContent };

function fontArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function svgDataUri(svg: Buffer): string {
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

function isSupportedRasterContentType(contentType: string): boolean {
  return (
    contentType === 'image/avif' ||
    contentType === 'image/jpeg' ||
    contentType === 'image/jpg' ||
    contentType === 'image/png' ||
    contentType === 'image/webp'
  );
}

function decodeDataUri(dataUri: string): Buffer {
  const separatorIndex = dataUri.indexOf(',');
  const header = dataUri.slice(0, separatorIndex);
  if (separatorIndex < 0 || !/;base64$/i.test(header)) {
    throw new Error('Resolved image asset data URI must be base64 encoded');
  }
  return Buffer.from(dataUri.slice(separatorIndex + 1), 'base64');
}

async function readAssetBytes(
  asset: Extract<ResolvedSlideAsset, { kind: 'image' }>,
): Promise<Buffer> {
  if (asset.dataUri) return decodeDataUri(asset.dataUri);
  if (asset.filePath) return readFile(asset.filePath);
  throw new Error('Resolved image asset has neither dataUri nor filePath');
}

async function materializeAssetDataUri(
  asset: ResolvedSlideAsset,
): Promise<ResolvedSlideAsset> {
  if (asset.kind !== 'image') return asset;

  const bytes = await readAssetBytes(asset);
  if (isSupportedRasterContentType(asset.contentType)) {
    const png = await sharp(bytes, {
      animated: false,
      failOn: 'error',
    })
      .png()
      .toBuffer();
    return {
      ...asset,
      contentType: 'image/png',
      dataUri: `data:image/png;base64,${png.toString('base64')}`,
    };
  }

  return {
    ...asset,
    dataUri: `data:${asset.contentType};base64,${bytes.toString('base64')}`,
  };
}

async function stageElementAndSize(
  input: SatoriStageInput,
  logoDataUri: string,
): Promise<{
  element: ReturnType<typeof renderSlideElement>;
  width: number;
  height: number;
}> {
  if (input.kind === 'frame') {
    return {
      element: renderBrandFrameElement(input.frame, logoDataUri),
      width: PORTRAIT_OUTPUT_WIDTH * RASTER_SCALE,
      height: PORTRAIT_OUTPUT_HEIGHT * RASTER_SCALE,
    };
  }
  if (input.kind === 'outro') {
    return {
      element: renderOutroElement(input.outro, logoDataUri),
      width: PORTRAIT_OUTPUT_WIDTH * RASTER_SCALE,
      height: PORTRAIT_OUTPUT_HEIGHT * RASTER_SCALE,
    };
  }
  const asset = await materializeAssetDataUri(input.asset);
  return {
    element: renderSlideElement(input.slide, asset, logoDataUri),
    width: LANDSCAPE_OUTPUT_WIDTH * RASTER_SCALE,
    height: LANDSCAPE_OUTPUT_HEIGHT * RASTER_SCALE,
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

  const { element, width, height } = await stageElementAndSize(
    input,
    svgDataUri(logo),
  );
  const svg = await satori(element, {
    width,
    height,
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
