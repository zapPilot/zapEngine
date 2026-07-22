import { spawn } from 'node:child_process';

import { path as bundledFfmpegPath } from '@ffmpeg-installer/ffmpeg';

import { abortError, throwIfAborted } from './abort.js';
import type { SlideVideoManifest } from './manifest.js';

export interface VideoProcessResult {
  stdout: string;
  stderr: string;
}
export type VideoProcessRunner = (
  executable: string,
  args: string[],
  inheritStdio?: boolean,
  signal?: AbortSignal,
) => Promise<VideoProcessResult>;

export interface StaticSlideVideoOptions {
  manifest: SlideVideoManifest;
  slidePaths: string[];
  audioSource: string;
  filterScriptPath: string;
  outputPath: string;
  signal?: AbortSignal;
}

export function resolveVideoFfmpegPath(): string {
  return process.env['VIDEO_FFMPEG_PATH']?.trim() || bundledFfmpegPath;
}

function invokeProcessRunner(
  processRunner: VideoProcessRunner,
  executable: string,
  args: string[],
  inheritStdio: boolean | undefined,
  signal: AbortSignal | undefined,
): Promise<VideoProcessResult> {
  if (signal) return processRunner(executable, args, inheritStdio, signal);
  return inheritStdio
    ? processRunner(executable, args, true)
    : processRunner(executable, args);
}

export async function runProcess(
  executable: string,
  args: string[],
  inheritStdio = false,
  abortSignal?: AbortSignal,
): Promise<VideoProcessResult> {
  throwIfAborted(abortSignal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    // jscpd:ignore-start — shared child-process lifecycle pattern; same design in rasterizer.ts
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let stdout = '';
    let stderr = '';
    const cleanup = () => {
      abortSignal?.removeEventListener('abort', onAbort);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };
    const settleResolve = (value: VideoProcessResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      forceKillTimer.unref?.();
    };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();
    // jscpd:ignore-end

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', (error) =>
      settleReject(
        abortSignal?.aborted
          ? abortError(abortSignal, `${executable} aborted`)
          : error,
      ),
    );
    child.once('exit', (code, signal) => {
      if (abortSignal?.aborted) {
        settleReject(abortError(abortSignal, `${executable} aborted`));
        return;
      }
      if (code === 0) {
        settleResolve({ stdout, stderr });
        return;
      }
      settleReject(
        new Error(
          `${executable} failed (${signal ? `signal ${signal}` : `exit ${String(code)}`}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

export async function assertVideoFfmpegCapabilities(
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const [filters, encoders] = await Promise.all([
    invokeProcessRunner(
      processRunner,
      ffmpegPath,
      ['-hide_banner', '-filters'],
      false,
      signal,
    ),
    invokeProcessRunner(
      processRunner,
      ffmpegPath,
      ['-hide_banner', '-encoders'],
      false,
      signal,
    ),
  ]);
  const filterOutput = `${filters.stdout}\n${filters.stderr}`;
  const encoderOutput = `${encoders.stdout}\n${encoders.stderr}`;
  const missing = [
    !/\bxfade\b/.test(filterOutput) ? 'xfade filter' : null,
    !/\bzoompan\b/.test(filterOutput) ? 'zoompan filter' : null,
    !/\bass\b/.test(filterOutput) ? 'ass filter' : null,
    !/\blibx264\b/.test(encoderOutput) ? 'libx264 encoder' : null,
    !/\baac\b/.test(encoderOutput) ? 'AAC encoder' : null,
  ].filter((capability): capability is string => capability !== null);

  if (missing.length > 0) {
    throw new Error(`FFmpeg is missing: ${missing.join(', ')}`);
  }
}

function escapeFilterPath(path: string): string {
  return path
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'");
}

export type KenBurnsPan =
  | 'center'
  | 'leftToRight'
  | 'rightToLeft'
  | 'topToBottom';

export function kenBurnsPanForScene(index: number): KenBurnsPan {
  const motions: readonly KenBurnsPan[] = [
    'center',
    'leftToRight',
    'rightToLeft',
    'topToBottom',
  ];
  return motions[index % motions.length] ?? 'center';
}

function kenBurnsFilter(
  slide: SlideVideoManifest['slides'][number],
  index: number,
  fps: number,
  width: number,
  height: number,
): string {
  const durationFrames = Math.max(
    2,
    Math.round(((slide.endMs - slide.startMs) * fps) / 1_000),
  );
  const finalFrame = durationFrames - 1;
  const progress = `min(on/${finalFrame}\\,1)`;
  const zoom = `1+0.05*${progress}`;
  const centerX = '(iw-iw/zoom)/2';
  const centerY = '(ih-ih/zoom)/2';
  const motion = kenBurnsPanForScene(index);

  let x = centerX;
  let y = centerY;
  if (slide.asset.kind === 'remoteImage') {
    if (slide.asset.position === 'top') y = '0';
    if (slide.asset.position === 'bottom') y = 'ih-ih/zoom';
  }
  if (motion === 'leftToRight') {
    x = `(iw-iw/zoom)*${progress}`;
  } else if (motion === 'rightToLeft') {
    x = `(iw-iw/zoom)*(1-${progress})`;
  } else if (
    motion === 'topToBottom' &&
    (slide.asset.kind !== 'remoteImage' || slide.asset.position === 'center')
  ) {
    y = `(ih-ih/zoom)*${progress}`;
  }

  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

export function buildStaticSlideFilter(
  manifest: SlideVideoManifest,
  subtitlePath: string,
  fontsDirectory: string,
): string {
  const fps = manifest.clip.fps;
  const transitionFrames = Math.round(
    (manifest.clip.transitionMs * fps) / 1_000,
  );
  const totalFrames = Math.round((manifest.clip.durationMs * fps) / 1_000);
  const filters: string[] = manifest.slides.map(
    (slide, index) =>
      `[${index}:v]fps=${fps},scale=${manifest.clip.width}:${manifest.clip.height}:flags=lanczos+accurate_rnd:in_range=pc:out_range=tv:out_color_matrix=bt709,${kenBurnsFilter(slide, index, fps, manifest.clip.width, manifest.clip.height)},setsar=1,format=yuv444p,settb=expr=1/${fps},setpts=N[s${index}]`,
  );

  let priorLabel = 's0';
  manifest.slides.slice(1).forEach((slide, offsetIndex) => {
    const slideIndex = offsetIndex + 1;
    const nextStartFrame = Math.round((slide.startMs * fps) / 1_000);
    const transitionOffset = (nextStartFrame - transitionFrames) / fps;
    const outputLabel = `x${slideIndex}`;
    filters.push(
      `[${priorLabel}][s${slideIndex}]xfade=transition=fade:duration=${manifest.clip.transitionMs / 1_000}:offset=${transitionOffset.toFixed(6)}[${outputLabel}]`,
    );
    priorLabel = outputLabel;
  });

  filters.push(
    `[${priorLabel}]fps=${fps},trim=end_frame=${totalFrames},settb=expr=1/${fps},setpts=N,ass=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(fontsDirectory)}',format=yuv420p[vout]`,
  );
  const audioInputIndex = manifest.slides.length;
  const audioSamples = Math.round((manifest.clip.durationMs / 1_000) * 48_000);
  filters.push(
    `[${audioInputIndex}:a]aresample=sample_rate=48000:async=1:first_pts=0,atrim=end_sample=${audioSamples},asetpts=N/SR/TB[aout]`,
  );
  return filters.join(';\n');
}

export function buildStaticSlideFfmpegArgs(
  options: StaticSlideVideoOptions,
): string[] {
  const { manifest } = options;
  const totalFrames = Math.round(
    (manifest.clip.durationMs * manifest.clip.fps) / 1_000,
  );
  const durationSeconds = manifest.clip.durationMs / 1_000;
  const imageInputs = options.slidePaths.flatMap((slidePath) => [
    '-loop',
    '1',
    '-framerate',
    String(manifest.clip.fps),
    '-i',
    slidePath,
  ]);

  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    '-stats',
    ...imageInputs,
    '-i',
    options.audioSource,
    '-filter_complex_script',
    options.filterScriptPath,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-frames:v',
    String(totalFrames),
    '-t',
    String(durationSeconds),
    '-shortest',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '17',
    '-tune',
    'stillimage',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(manifest.clip.fps),
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    options.outputPath,
  ];
}

export async function renderStaticSlideVideo(
  options: StaticSlideVideoOptions,
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
): Promise<void> {
  throwIfAborted(options.signal);
  await assertVideoFfmpegCapabilities(
    ffmpegPath,
    processRunner,
    options.signal,
  );
  await invokeProcessRunner(
    processRunner,
    ffmpegPath,
    buildStaticSlideFfmpegArgs(options),
    true,
    options.signal,
  );
}
