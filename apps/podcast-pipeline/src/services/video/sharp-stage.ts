import { readFile } from 'node:fs/promises';

import sharp from 'sharp';

function configureSharp(): void {
  sharp.cache(false);
  sharp.concurrency(1);
}

async function resizeImageToPng(input: {
  imagePath: string;
  outputPath: string;
  width: number;
  height: number;
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
  await image
    .resize(input.width, input.height, {
      fit: 'fill',
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

export async function runSharpCropStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const input = await readResizeInput<SharpCropStageInput>(
    inputPath,
    'Sharp crop stage',
  );
  configureSharp();
  // Portrait news media must remain completely visible. The old `cover` path
  // cropped wide photos before FFmpeg ever saw them, so later motion could not
  // recover faces, logos, screenshots, or text near the edges. Keep the
  // `sharp-crop` stage name for compatibility with existing job dispatch, but
  // its portrait contract is now contain + dark padding; focal `position` is
  // intentionally ignored.
  await sharp(input.imagePath, {
    failOn: 'error',
    animated: false,
  })
    .rotate()
    .resize(input.width, input.height, {
      fit: 'contain',
      position: 'centre',
      background: '#101014',
      kernel: sharp.kernel.lanczos3,
    })
    .png({
      compressionLevel: 1,
      adaptiveFiltering: false,
    })
    .toFile(outputPath);
}
