import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

import { LANDSCAPE_OUTPUT_HEIGHT, LANDSCAPE_OUTPUT_WIDTH } from './manifest.js';

function configureSharp(): void {
  sharp.cache(false);
  sharp.concurrency(1);
}

async function resizeImageToPng(input: {
  imagePath: string;
  outputPath: string;
  width: number;
  height: number;
  position?: string;
  pngOptions?: {
    compressionLevel: number;
    adaptiveFiltering: boolean;
  };
}): Promise<void> {
  configureSharp();
  const image = sharp(input.imagePath, {
    failOn: 'error',
    animated: false,
  });
  if (input.position) image.rotate();
  await image
    .resize(input.width, input.height, {
      fit: input.position ? 'cover' : 'fill',
      ...(input.position ? { position: input.position } : {}),
      kernel: sharp.kernel.lanczos3,
    })
    .png(
      input.pngOptions ?? {
        compressionLevel: 9,
        adaptiveFiltering: true,
      },
    )
    .toFile(input.outputPath);
}

async function readResizeInput<T extends SharpScaleStageInput>(
  inputPath: string,
  label: string,
): Promise<T> {
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as T;
  if (!input.imagePath || !input.width || !input.height) {
    throw new Error(`${label} input is missing imagePath or size`);
  }
  return input;
}

// The plain sharp stage serves only legacy landscape slide rasters; portrait
// cards go through runSharpScaleStage below.
export function runSharpStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return resizeImageToPng({
    imagePath: inputPath,
    outputPath,
    width: LANDSCAPE_OUTPUT_WIDTH,
    height: LANDSCAPE_OUTPUT_HEIGHT,
  });
}

export interface SharpScaleStageInput {
  imagePath: string;
  width: number;
  height: number;
}

// Downscales a fixed portrait design master to the manifest's explicit output
// size. PNG output keeps alpha — the brand frame relies on its transparent
// media window.
export async function runSharpScaleStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const input = await readResizeInput<SharpScaleStageInput>(
    inputPath,
    'Sharp scale stage',
  );
  await resizeImageToPng({ ...input, outputPath });
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
  const input = await readResizeInput<SharpCropStageInput>(
    inputPath,
    'Sharp crop stage',
  );
  await resizeImageToPng({
    ...input,
    outputPath,
    position: cropPositions[input.position] ?? 'centre',
    pngOptions: {
      compressionLevel: 1,
      adaptiveFiltering: false,
    },
  });
}
