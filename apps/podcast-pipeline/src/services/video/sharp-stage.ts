import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import {
  LANDSCAPE_OUTPUT_HEIGHT,
  LANDSCAPE_OUTPUT_WIDTH,
  RASTER_SCALE,
} from './manifest.js';

function configureSharp(): void {
  sharp.cache(false);
  sharp.concurrency(1);
}

// The plain sharp stage serves only legacy landscape slide rasters; portrait
// cards go through runSharpScaleStage below.
export async function runSharpStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  configureSharp();
  await sharp(inputPath, { failOn: 'error' })
    .resize(LANDSCAPE_OUTPUT_WIDTH, LANDSCAPE_OUTPUT_HEIGHT, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

// Downscales a satori/resvg master to its 1x output size, derived from the
// master's own dimensions so portrait and landscape masters both work. PNG
// output keeps the alpha channel — the brand frame relies on its transparent
// media window.
export async function runSharpScaleStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  configureSharp();
  const image = sharp(inputPath, { failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Sharp scale stage could not read master dimensions');
  }
  await image
    .resize(
      Math.round(metadata.width / RASTER_SCALE),
      Math.round(metadata.height / RASTER_SCALE),
      { fit: 'fill', kernel: sharp.kernel.lanczos3 },
    )
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

export interface SharpCropStageInput {
  imagePath: string;
  width: number;
  height: number;
  position: 'center' | 'top' | 'bottom';
}

const cropPositions = {
  center: 'centre',
  top: 'top',
  bottom: 'bottom',
} as const;

export async function runSharpCropStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  configureSharp();
  const input = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as SharpCropStageInput;
  if (!input.imagePath || !input.width || !input.height) {
    throw new Error('Sharp crop stage input is missing imagePath or size');
  }
  await sharp(input.imagePath, { failOn: 'error', animated: false })
    .rotate()
    .resize(input.width, input.height, {
      fit: 'cover',
      position: cropPositions[input.position] ?? 'centre',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}
