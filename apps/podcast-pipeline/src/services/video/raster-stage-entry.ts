import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type RasterStage =
  | 'satori'
  | 'resvg'
  | 'sharp'
  | 'sharp-scale'
  | 'sharp-crop';

export async function runRasterStageCli(argv: string[]): Promise<void> {
  const [stage, inputPath, outputPath] = argv;
  if (!inputPath || !outputPath) {
    throw new Error(
      'Usage: raster-stage-entry <satori|resvg|sharp|sharp-scale|sharp-crop> <input> <output>',
    );
  }

  switch (stage as RasterStage) {
    case 'satori': {
      const { runSatoriStage } = await import('./satori-stage.js');
      await runSatoriStage(inputPath, outputPath);
      return;
    }
    case 'resvg': {
      const { runResvgStage } = await import('./resvg-stage.js');
      await runResvgStage(inputPath, outputPath);
      return;
    }
    case 'sharp': {
      const { runSharpStage } = await import('./sharp-stage.js');
      await runSharpStage(inputPath, outputPath);
      return;
    }
    case 'sharp-scale': {
      const { runSharpScaleStage } = await import('./sharp-stage.js');
      await runSharpScaleStage(inputPath, outputPath);
      return;
    }
    case 'sharp-crop': {
      const { runSharpCropStage } = await import('./sharp-stage.js');
      await runSharpCropStage(inputPath, outputPath);
      return;
    }
    default:
      throw new Error(`Unknown raster stage: ${String(stage)}`);
  }
}

// jscpd:ignore-start — CLI direct-invocation check, same pattern in cli.ts, smoke-cli.ts, r2-playback-canary.ts
const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runRasterStageCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}
// jscpd:ignore-end
