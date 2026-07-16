import sharp from 'sharp';

import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from './manifest.js';

export async function runSharpStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  sharp.cache(false);
  sharp.concurrency(1);
  await sharp(inputPath, { failOn: 'error' })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}
