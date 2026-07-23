import { spawn } from 'node:child_process';

import { path as bundledFfmpegPath } from '@ffmpeg-installer/ffmpeg';

import { abortError, throwIfAborted } from './abort.js';
import type { SlideVideoManifest, VerticalVideoManifest } from './manifest.js';

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

export interface VerticalSlideVideoOptions {
  manifest: VerticalVideoManifest;
  mediaPaths: string[];
  framePath: string;
  outroPath: string;
  audioSource: string;
  bgmPath: string;
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

const HIDE_BANNER_FLAG = '-hide_banner';

export async function assertVideoFfmpegCapabilities(
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const [filters, encoders, amixHelp] = await Promise.all([
    invokeProcessRunner(
      processRunner,
      ffmpegPath,
      [HIDE_BANNER_FLAG, '-filters'],
      false,
      signal,
    ),
    invokeProcessRunner(
      processRunner,
      ffmpegPath,
      [HIDE_BANNER_FLAG, '-encoders'],
      false,
      signal,
    ),
    invokeProcessRunner(
      processRunner,
      ffmpegPath,
      [HIDE_BANNER_FLAG, '-h', 'filter=amix'],
      false,
      signal,
    ),
  ]);
  const filterOutput = `${filters.stdout}\n${filters.stderr}`;
  const encoderOutput = `${encoders.stdout}\n${encoders.stderr}`;
  const amixHelpOutput = `${amixHelp.stdout}\n${amixHelp.stderr}`;
  const requiredFilters = [
    'xfade',
    'zoompan',
    'ass',
    'overlay',
    'pad',
    'fade',
    'apad',
    'afade',
    'amix',
    'asplit',
    'aformat',
    'sidechaincompress',
  ];
  const missing = [
    ...requiredFilters.map((filterName) =>
      new RegExp(`\\b${filterName}\\b`).test(filterOutput)
        ? null
        : `${filterName} filter`,
    ),
    !/\blibx264\b/.test(encoderOutput) ? 'libx264 encoder' : null,
    !/\baac\b/.test(encoderOutput) ? 'AAC encoder' : null,
    // amix appears in `-filters` on old builds too, but the normalize option
    // the BGM mix relies on needs ffmpeg >= 4.4 — probe the filter help.
    !/\bnormalize\b/.test(amixHelpOutput)
      ? 'amix normalize option (ffmpeg >= 4.4)'
      : null,
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

function slideSceneFilters(
  slides: SlideVideoManifest['slides'],
  fps: number,
  width: number,
  height: number,
): string[] {
  return slides.map(
    (slide, index) =>
      `[${index}:v]fps=${fps},scale=${width}:${height}:flags=lanczos+accurate_rnd:in_range=pc:out_range=tv:out_color_matrix=bt709,${kenBurnsFilter(slide, index, fps, width, height)},setsar=1,format=yuv444p,settb=expr=1/${fps},setpts=N[s${index}]`,
  );
}

function sceneChain(
  manifest: Pick<SlideVideoManifest, 'slides' | 'clip'>,
  width: number,
  height: number,
): { filters: string[]; priorLabel: string } {
  const fps = manifest.clip.fps;
  const filters = slideSceneFilters(manifest.slides, fps, width, height);
  const priorLabel = appendXfadeChain(
    filters,
    manifest.slides,
    fps,
    manifest.clip.transitionMs,
  );
  return { filters, priorLabel };
}

function appendXfadeChain(
  filters: string[],
  slides: SlideVideoManifest['slides'],
  fps: number,
  transitionMs: number,
): string {
  const transitionFrames = Math.round((transitionMs * fps) / 1_000);
  let priorLabel = 's0';
  slides.slice(1).forEach((slide, offsetIndex) => {
    const slideIndex = offsetIndex + 1;
    const nextStartFrame = Math.round((slide.startMs * fps) / 1_000);
    const transitionOffset = (nextStartFrame - transitionFrames) / fps;
    const outputLabel = `x${slideIndex}`;
    filters.push(
      `[${priorLabel}][s${slideIndex}]xfade=transition=fade:duration=${transitionMs / 1_000}:offset=${transitionOffset.toFixed(6)}[${outputLabel}]`,
    );
    priorLabel = outputLabel;
  });
  return priorLabel;
}

export function buildStaticSlideFilter(
  manifest: SlideVideoManifest,
  subtitlePath: string,
  fontsDirectory: string,
): string {
  const fps = manifest.clip.fps;
  const totalFrames = Math.round((manifest.clip.durationMs * fps) / 1_000);
  const { filters, priorLabel } = sceneChain(
    manifest,
    manifest.clip.width,
    manifest.clip.height,
  );

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

const OUTRO_FADE_IN_SECONDS = 0.4;
const BGM_FADE_OUT_SECONDS = 0.9;
const BGM_DUCK_SIDECHAIN =
  'sidechaincompress=threshold=0.02:ratio=12:attack=25:release=450';

export function buildVerticalSlideFilter(
  manifest: VerticalVideoManifest,
  subtitlePath: string,
  fontsDirectory: string,
): string {
  const fps = manifest.clip.fps;
  const window = manifest.mediaWindow;
  const totalFrames = Math.round((manifest.clip.durationMs * fps) / 1_000);
  const totalSeconds = manifest.clip.durationMs / 1_000;
  const narrationSeconds = manifest.audio.narrationDurationMs / 1_000;
  const totalSamples = Math.round((manifest.clip.durationMs / 1_000) * 48_000);
  const frameInputIndex = manifest.slides.length;
  const outroInputIndex = frameInputIndex + 1;
  const narrationInputIndex = frameInputIndex + 2;
  const bgmInputIndex = frameInputIndex + 3;

  // Media scenes render at window resolution, so the Ken Burns motion never
  // touches the brand frame layered on top of the padded canvas.
  const { filters, priorLabel } = sceneChain(
    manifest,
    window.width,
    window.height,
  );

  filters.push(
    `[${priorLabel}]fps=${fps},trim=end_frame=${totalFrames},settb=expr=1/${fps},setpts=N,pad=${manifest.clip.width}:${manifest.clip.height}:${window.x}:${window.y}:color=0x101014[canvas]`,
  );
  filters.push(`[${frameInputIndex}:v]format=rgba[frame]`);
  filters.push(`[canvas][frame]overlay=0:0:format=auto[framed]`);
  filters.push(
    `[${outroInputIndex}:v]format=rgba,fade=t=in:st=${narrationSeconds}:d=${OUTRO_FADE_IN_SECONDS}:alpha=1[outro]`,
  );
  filters.push(
    `[framed][outro]overlay=0:0:format=auto:enable='gte(t,${narrationSeconds})'[branded]`,
  );
  filters.push(
    `[branded]ass=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(fontsDirectory)}',format=yuv420p[vout]`,
  );

  // Narration is padded with silence through the outro tail and split so the
  // pre-pad signal keys the BGM ducking compressor.
  filters.push(
    `[${narrationInputIndex}:a]aresample=sample_rate=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,apad=whole_dur=${totalSeconds},atrim=end_sample=${totalSamples},asetpts=N/SR/TB,asplit=2[nar_mix][nar_key]`,
  );
  filters.push(
    `[${bgmInputIndex}:a]aresample=sample_rate=48000,aformat=channel_layouts=stereo,volume=${manifest.bgm.gainDb}dB,atrim=end_sample=${totalSamples},asetpts=N/SR/TB[bgm_lvl]`,
  );
  filters.push(`[bgm_lvl][nar_key]${BGM_DUCK_SIDECHAIN}[bgm_duck]`);
  filters.push(
    `[nar_mix][bgm_duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,afade=t=out:st=${(totalSeconds - BGM_FADE_OUT_SECONDS).toFixed(3)}:d=${BGM_FADE_OUT_SECONDS},atrim=end_sample=${totalSamples},asetpts=N/SR/TB[aout]`,
  );
  return filters.join(';\n');
}

function loopedImageInputs(paths: readonly string[], fps: number): string[] {
  return paths.flatMap((path) => [
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-i',
    path,
  ]);
}

function encoderOutputArgs(input: {
  fps: number;
  totalFrames: number;
  durationSeconds: number;
  filterScriptPath: string;
  outputPath: string;
}): string[] {
  return [
    '-filter_complex_script',
    input.filterScriptPath,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-frames:v',
    String(input.totalFrames),
    '-t',
    String(input.durationSeconds),
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
    String(input.fps),
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
    input.outputPath,
  ];
}

function renderArgs(input: {
  fps: number;
  durationMs: number;
  imagePaths: readonly string[];
  audioInputArgs: readonly string[];
  filterScriptPath: string;
  outputPath: string;
}): string[] {
  return [
    '-y',
    HIDE_BANNER_FLAG,
    '-loglevel',
    'warning',
    '-stats',
    ...loopedImageInputs(input.imagePaths, input.fps),
    ...input.audioInputArgs,
    ...encoderOutputArgs({
      fps: input.fps,
      totalFrames: Math.round((input.durationMs * input.fps) / 1_000),
      durationSeconds: input.durationMs / 1_000,
      filterScriptPath: input.filterScriptPath,
      outputPath: input.outputPath,
    }),
  ];
}

export function buildStaticSlideFfmpegArgs(
  options: StaticSlideVideoOptions,
): string[] {
  return renderArgs({
    fps: options.manifest.clip.fps,
    durationMs: options.manifest.clip.durationMs,
    imagePaths: options.slidePaths,
    audioInputArgs: ['-i', options.audioSource],
    filterScriptPath: options.filterScriptPath,
    outputPath: options.outputPath,
  });
}

export function buildVerticalFfmpegArgs(
  options: VerticalSlideVideoOptions,
): string[] {
  const { manifest } = options;
  if (options.mediaPaths.length !== manifest.slides.length) {
    throw new Error(
      `Vertical render needs ${manifest.slides.length} media inputs, received ${options.mediaPaths.length}`,
    );
  }
  return renderArgs({
    fps: manifest.clip.fps,
    durationMs: manifest.clip.durationMs,
    imagePaths: [...options.mediaPaths, options.framePath, options.outroPath],
    // The BGM track loops for as long as the mix needs it; atrim in the
    // filtergraph bounds the audible length.
    audioInputArgs: [
      '-i',
      options.audioSource,
      '-stream_loop',
      '-1',
      '-i',
      options.bgmPath,
    ],
    filterScriptPath: options.filterScriptPath,
    outputPath: options.outputPath,
  });
}

async function renderWithFfmpeg(
  args: string[],
  signal: AbortSignal | undefined,
  ffmpegPath: string,
  processRunner: VideoProcessRunner,
): Promise<void> {
  await assertVideoFfmpegCapabilities(ffmpegPath, processRunner, signal);
  await invokeProcessRunner(processRunner, ffmpegPath, args, true, signal);
}

export async function renderStaticSlideVideo(
  options: StaticSlideVideoOptions,
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
): Promise<void> {
  throwIfAborted(options.signal);
  await renderWithFfmpeg(
    buildStaticSlideFfmpegArgs(options),
    options.signal,
    ffmpegPath,
    processRunner,
  );
}

export async function renderVerticalSlideVideo(
  options: VerticalSlideVideoOptions,
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
): Promise<void> {
  throwIfAborted(options.signal);
  await renderWithFfmpeg(
    buildVerticalFfmpegArgs(options),
    options.signal,
    ffmpegPath,
    processRunner,
  );
}
