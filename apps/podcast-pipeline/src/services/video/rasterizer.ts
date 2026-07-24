import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { abortError, throwIfAborted } from './abort.js';
import type { ResolvedSlideAsset } from './assets.js';
import type { Slide } from './manifest.js';
import type { RasterStage } from './raster-stage-entry.js';
import type { SatoriStageInput } from './satori-stage.js';
import type { SharpCropStageInput } from './sharp-stage.js';
import type { BrandFrameContent, OutroContent } from './templates.js';

type RunStage = (
  stage: RasterStage,
  inputPath: string,
  outputPath: string,
  signal?: AbortSignal,
) => Promise<void>;

interface RasterizeOptions {
  runStage?: RunStage;
  signal?: AbortSignal;
}

function stageEntryPath(): string {
  const extension = extname(fileURLToPath(import.meta.url));
  return fileURLToPath(
    new URL(`./raster-stage-entry${extension}`, import.meta.url),
  );
}

export async function runRasterStage(
  stage: RasterStage,
  inputPath: string,
  outputPath: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  throwIfAborted(abortSignal);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, stageEntryPath(), stage, inputPath, outputPath],
      { stdio: 'inherit' },
    );
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      abortSignal?.removeEventListener('abort', onAbort);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      if (typeof child.kill !== 'function') {
        settleReject(abortError(abortSignal, `Raster ${stage} stage aborted`));
        return;
      }
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      forceKillTimer.unref?.();
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();

    child.once('error', (error) =>
      settleReject(
        abortSignal?.aborted
          ? abortError(abortSignal, `Raster ${stage} stage aborted`)
          : error,
      ),
    );
    child.once('exit', (code, exitSignal) => {
      if (settled) return;
      if (abortSignal?.aborted) {
        settleReject(abortError(abortSignal, `Raster ${stage} stage aborted`));
        return;
      }
      if (code === 0) {
        settleResolve();
        return;
      }
      settleReject(
        new Error(
          `Raster ${stage} stage failed (${exitSignal ? `signal ${exitSignal}` : `exit ${String(code)}`})`,
        ),
      );
    });
  });
}

export interface CardRasterPaths {
  input: string;
  svg: string;
  master: string;
  output: string;
}

async function writeStageInputFile(
  inputPath: string,
  payload: unknown,
  outputPaths: readonly string[],
): Promise<void> {
  await Promise.all(
    [inputPath, ...outputPaths].map((target) =>
      mkdir(dirname(target), { recursive: true }),
    ),
  );
  await writeFile(inputPath, JSON.stringify(payload), 'utf8');
}

async function runRasterStages(
  stageInput: SatoriStageInput,
  paths: CardRasterPaths,
  options: RasterizeOptions,
  finalStage: RasterStage,
): Promise<void> {
  const runStage = options.runStage ?? runRasterStage;
  throwIfAborted(options.signal);
  await writeStageInputFile(paths.input, stageInput, [
    paths.master,
    paths.output,
  ]);
  await runStage('satori', paths.input, paths.svg, options.signal);
  await runStage('resvg', paths.svg, paths.master, options.signal);
  await runStage(finalStage, paths.master, paths.output, options.signal);
}

export async function rasterizeSlide(
  slide: Slide,
  asset: ResolvedSlideAsset,
  paths: CardRasterPaths,
  runStageOrOptions: RunStage | RasterizeOptions = {},
): Promise<void> {
  const options: RasterizeOptions =
    typeof runStageOrOptions === 'function'
      ? { runStage: runStageOrOptions }
      : runStageOrOptions;
  await runRasterStages({ slide, asset }, paths, options, 'sharp');
}

function rasterizePortraitCard(
  stageInput: Extract<SatoriStageInput, { kind: 'frame' | 'outro' }>,
  paths: CardRasterPaths,
  options: RasterizeOptions,
): Promise<void> {
  // sharp-scale keeps the alpha channel; the brand frame's transparent media
  // window must survive down to the ffmpeg overlay input.
  return runRasterStages(stageInput, paths, options, 'sharp-scale');
}

export function rasterizeBrandFrame(
  frame: BrandFrameContent,
  paths: CardRasterPaths,
  options: RasterizeOptions = {},
): Promise<void> {
  return rasterizePortraitCard({ kind: 'frame', frame }, paths, options);
}

export function rasterizeOutro(
  outro: OutroContent,
  paths: CardRasterPaths,
  options: RasterizeOptions = {},
): Promise<void> {
  return rasterizePortraitCard({ kind: 'outro', outro }, paths, options);
}

export async function cropMediaImage(
  crop: SharpCropStageInput,
  paths: { input: string; output: string },
  options: RasterizeOptions = {},
): Promise<void> {
  const runStage = options.runStage ?? runRasterStage;
  throwIfAborted(options.signal);
  await writeStageInputFile(paths.input, crop, [paths.output]);
  await runStage('sharp-crop', paths.input, paths.output, options.signal);
}
