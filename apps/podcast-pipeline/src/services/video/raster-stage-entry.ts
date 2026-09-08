import { runCli } from '../../lib/cli-runner.js';
import { isMainModule } from '../../lib/is-main-module.js';

export type RasterStage = 'satori' | 'resvg' | 'sharp-scale' | 'sharp-crop';

export async function runRasterStageCli(argv: string[]): Promise<void> {
  const [stage, inputPath, outputPath] = argv;
  if (!inputPath || !outputPath) {
    throw new Error(
      'Usage: raster-stage-entry <satori|resvg|sharp-scale|sharp-crop> <input> <output>',
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

if (isMainModule(import.meta.url)) {
  runCli(() => runRasterStageCli(process.argv.slice(2)));
}
