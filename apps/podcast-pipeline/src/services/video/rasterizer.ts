import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { abortError, throwIfAborted } from './abort.js';
import type { ResolvedSlideAsset } from './assets.js';
import type { Slide } from './manifest.js';
import type { RasterStage } from './raster-stage-entry.js';

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

export async function rasterizeSlide(
  slide: Slide,
  asset: ResolvedSlideAsset,
  paths: {
    input: string;
    svg: string;
    master: string;
    output: string;
  },
  runStageOrOptions: RunStage | RasterizeOptions = {},
): Promise<void> {
  const options: RasterizeOptions =
    typeof runStageOrOptions === 'function'
      ? { runStage: runStageOrOptions }
      : runStageOrOptions;
  const runStage = options.runStage ?? runRasterStage;
  throwIfAborted(options.signal);
  await Promise.all([
    mkdir(dirname(paths.input), { recursive: true }),
    mkdir(dirname(paths.master), { recursive: true }),
    mkdir(dirname(paths.output), { recursive: true }),
  ]);
  await writeFile(paths.input, JSON.stringify({ slide, asset }), 'utf8');
  await runStage('satori', paths.input, paths.svg, options.signal);
  await runStage('resvg', paths.svg, paths.master, options.signal);
  await runStage('sharp', paths.master, paths.output, options.signal);
}
