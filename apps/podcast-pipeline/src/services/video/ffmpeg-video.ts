import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';

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
  streamStdio?: boolean,
  signal?: AbortSignal,
  onStdoutLine?: (line: string) => void,
) => Promise<VideoProcessResult>;

const STREAMED_OUTPUT_TAIL_LIMIT = 8_000;

interface SlideVideoRenderOptionsBase {
  audioSource: string;
  outputPath: string;
  signal?: AbortSignal;
  onEncodeProgress?: (fraction: number) => void;
}

export interface StaticSlideVideoOptions extends SlideVideoRenderOptionsBase {
  manifest: SlideVideoManifest;
  slidePaths: string[];
  filterScriptPath: string;
}

export interface VerticalSlideVideoOptions extends SlideVideoRenderOptionsBase {
  manifest: VerticalVideoManifest;
  mediaPaths: string[];
  framePath: string;
  outroPath: string;
  bgmPath: string;
  subtitlePath: string;
  fontsDirectory: string;
}

export function resolveVideoFfmpegPath(): string {
  return process.env['VIDEO_FFMPEG_PATH']?.trim() || bundledFfmpegPath;
}

function invokeProcessRunner(
  processRunner: VideoProcessRunner,
  executable: string,
  args: string[],
  streamStdio: boolean | undefined,
  signal: AbortSignal | undefined,
  onStdoutLine?: (line: string) => void,
): Promise<VideoProcessResult> {
  if (onStdoutLine) {
    return processRunner(executable, args, streamStdio, signal, onStdoutLine);
  }
  if (signal) return processRunner(executable, args, streamStdio, signal);
  return streamStdio
    ? processRunner(executable, args, true)
    : processRunner(executable, args);
}

export async function runProcess(
  executable: string,
  args: string[],
  streamStdio = false,
  abortSignal?: AbortSignal,
  onStdoutLine?: (line: string) => void,
): Promise<VideoProcessResult> {
  throwIfAborted(abortSignal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // jscpd:ignore-start — shared child-process lifecycle pattern; same design in rasterizer.ts
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let stdout = '';
    let stderr = '';
    let stdoutResidual = '';
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
      if (streamStdio) {
        stdout = boundedTail(stdout, chunk);
        if (onStdoutLine) {
          stdoutResidual = consumeLines(stdoutResidual, chunk, onStdoutLine);
        }
        return;
      }
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      if (streamStdio) {
        process.stderr.write(chunk);
        stderr = boundedTail(stderr, chunk);
        return;
      }
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
      settleReject(processFailureError(executable, code, signal, stderr));
    });
  });
}

export function parseFfmpegProgressOutTimeUs(line: string): number | null {
  const match = /^out_time_(?:us|ms)=(-?\d+)$/.exec(line.trim());
  if (!match?.[1]) return null;
  const microseconds = Number(match[1]);
  return Number.isFinite(microseconds) && microseconds >= 0
    ? microseconds
    : null;
}

export function createFfmpegEncodeProgressReader(
  totalDurationMs: number,
  onFraction: (fraction: number) => void,
  signal?: AbortSignal,
): (line: string) => void {
  const totalUs = totalDurationMs * 1_000;
  let highWaterMark = 0;
  return (line) => {
    if (line.trim() === 'progress=end') {
      if (signal?.aborted) return;
      if (highWaterMark >= 1) return;
      highWaterMark = 1;
      onFraction(1);
      return;
    }
    const outTimeUs = parseFfmpegProgressOutTimeUs(line);
    if (outTimeUs === null || totalUs <= 0) return;
    const fraction = Math.min(1, outTimeUs / totalUs);
    if (fraction <= highWaterMark) return;
    highWaterMark = fraction;
    onFraction(fraction);
  };
}

function consumeLines(
  residual: string,
  chunk: string,
  onLine: (line: string) => void,
): string {
  const lines = (residual + chunk).split('\n');
  const trailing = lines.pop() ?? '';
  for (const line of lines) onLine(line);
  return trailing;
}

function boundedTail(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length > STREAMED_OUTPUT_TAIL_LIMIT
    ? combined.slice(combined.length - STREAMED_OUTPUT_TAIL_LIMIT)
    : combined;
}

function processFailureError(
  executable: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
): Error {
  const how = signal ? `signal ${signal}` : `exit ${String(code)}`;
  const hint = signal === 'SIGKILL' ? ', likely out of memory' : '';
  const tail = stderr.trim();
  const summary = lastNonBlankLine(tail);
  const firstLine = `${executable} failed (${how}${hint})${summary ? `: ${summary}` : ''}`;
  return new Error(
    tail && tail !== summary ? `${firstLine}\n${tail}` : firstLine,
  );
}

function lastNonBlankLine(value: string): string {
  const lines = value.split(/\r\n|[\n\r]/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) return line;
  }
  return '';
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

export const MEDIA_MOTION_SUPERSAMPLE = 4 as const;
export const VERTICAL_MEDIA_CHUNK_SIZE = 8 as const;

const LEGACY_KEN_BURNS_ZOOM_RATE_PER_SECOND = 0.014;
const LEGACY_KEN_BURNS_MAX_EXTRA_ZOOM = 0.18;
const LEGACY_KEN_BURNS_PAN_ZOOM = 1.15;
const KEN_BURNS_HOLD_SAFETY_FRAMES = 2;
const EDITORIAL_DRIFT_INSET = 0.98;

export type KenBurnsPan =
  | 'zoomIn'
  | 'zoomOut'
  | 'leftToRight'
  | 'rightToLeft'
  | 'topToBottom';

const KEN_BURNS_MOTIONS: readonly KenBurnsPan[] = [
  'zoomIn',
  'leftToRight',
  'zoomOut',
  'rightToLeft',
  'topToBottom',
];

export function kenBurnsSeedForEpisode(episodeId: string): number {
  const digest = createHash('sha256').update(episodeId).digest();
  return (digest[0] ?? 0) % KEN_BURNS_MOTIONS.length;
}

export function kenBurnsPanForScene(index: number, seed = 0): KenBurnsPan {
  return (
    KEN_BURNS_MOTIONS[(index + seed) % KEN_BURNS_MOTIONS.length] ?? 'zoomIn'
  );
}

function legacyKenBurnsFilter(
  slide: SlideVideoManifest['slides'][number],
  index: number,
  seed: number,
  fps: number,
  width: number,
  height: number,
  holdFrames: number,
): string {
  const durationFrames = Math.max(
    2,
    Math.round(((slide.endMs - slide.startMs) * fps) / 1_000),
  );
  const finalFrame = durationFrames - 1;
  const progress = `min(on/${finalFrame}\\,1)`;
  const eased = `pow(${progress}\\,2)*(3-2*${progress})`;
  const extraZoom = Math.min(
    (LEGACY_KEN_BURNS_ZOOM_RATE_PER_SECOND * (slide.endMs - slide.startMs)) /
      1_000,
    LEGACY_KEN_BURNS_MAX_EXTRA_ZOOM,
  ).toFixed(4);

  const position =
    slide.asset.kind === 'remoteImage' ? slide.asset.position : 'center';
  let motion = kenBurnsPanForScene(index, seed);
  if (motion === 'topToBottom' && position !== 'center') motion = 'zoomIn';
  const isPan = motion !== 'zoomIn' && motion !== 'zoomOut';

  let zoom = `1+${extraZoom}*${eased}`;
  if (motion === 'zoomOut') zoom = `1+${extraZoom}*(1-${eased})`;
  if (isPan) zoom = String(LEGACY_KEN_BURNS_PAN_ZOOM);

  let x = '(iw-iw/zoom)/2';
  let y = '(ih-ih/zoom)/2';
  if (position === 'top') y = '0';
  if (position === 'bottom') y = 'ih-ih/zoom';
  if (motion === 'leftToRight') {
    x = `(iw-iw/zoom)*${eased}`;
  } else if (motion === 'rightToLeft') {
    x = `(iw-iw/zoom)*(1-${eased})`;
  } else if (motion === 'topToBottom') {
    y = `(ih-ih/zoom)*${eased}`;
  }

  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=${durationFrames + holdFrames}:s=${width}x${height}:fps=${fps}`;
}

function editorialKenBurnsFilter(
  slide: SlideVideoManifest['slides'][number],
  _index: number,
  _seed: number,
  fps: number,
  width: number,
  height: number,
  holdFrames: number,
): string {
  const durationFrames = Math.max(
    2,
    Math.round(((slide.endMs - slide.startMs) * fps) / 1_000),
  );
  // Fresh editorial payloads never zoom. `zoompan` remains only as the bounded
  // still-frame generator used by this encode path; z=1 preserves the complete
  // image that the contain stage handed us.
  return `zoompan=z='1':x='0':y='0':d=${durationFrames + holdFrames}:s=${width}x${height}:fps=${fps}`;
}

type EditorialMotion = Extract<
  SlideVideoManifest['slides'][number]['asset'],
  { kind: 'remoteImage' }
>['motion'];

// A missing `motion` marks a stored legacy payload. Every filter stage has to
// agree on that split, so they all read it here instead of re-deriving it.
function editorialMotionOf(
  slide: SlideVideoManifest['slides'][number],
): EditorialMotion {
  return slide.asset.kind === 'remoteImage' ? slide.asset.motion : undefined;
}

function editorialDriftFilter(
  slide: SlideVideoManifest['slides'][number],
  index: number,
  seed: number,
  fps: number,
  width: number,
  height: number,
  holdFrames: number,
): string | null {
  const motion = editorialMotionOf(slide);
  if (motion === undefined || motion === 'static') {
    return null;
  }
  const durationFrames = Math.max(
    2,
    Math.round(((slide.endMs - slide.startMs) * fps) / 1_000),
  );
  const outputFrames = durationFrames + holdFrames;
  const finalFrame = Math.max(1, outputFrames - 1);
  const progress = `min(n/${finalFrame}\\,1)`;
  const eased = `pow(${progress}\\,2)*(3-2*${progress})`;
  const innerWidth = Math.max(2, Math.round(width * EDITORIAL_DRIFT_INSET));
  const innerHeight = Math.max(2, Math.round(height * EDITORIAL_DRIFT_INSET));
  const canvasWidth = width + (width - innerWidth);
  const canvasHeight = height + (height - innerHeight);
  const travelX = canvasWidth - width;
  const travelY = canvasHeight - height;
  const centerX = (travelX / 2).toFixed(3);
  const centerY = (travelY / 2).toFixed(3);
  const varied = kenBurnsPanForScene(index, seed);

  let x = centerX;
  let y = centerY;
  if (varied === 'rightToLeft' || varied === 'zoomOut') {
    x = `${travelX}*(1-${eased})`;
  } else if (varied === 'topToBottom') {
    y = `${travelY}*${eased}`;
  } else {
    x = `${travelX}*${eased}`;
  }

  return `scale=${innerWidth}:${innerHeight}:flags=lanczos+accurate_rnd,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=0x101014,crop=${width}:${height}:x='${x}':y='${y}'`;
}

function kenBurnsFilter(
  slide: SlideVideoManifest['slides'][number],
  index: number,
  seed: number,
  fps: number,
  width: number,
  height: number,
  holdFrames: number,
): string {
  const hasExplicitEditorialMotion = editorialMotionOf(slide) !== undefined;
  return hasExplicitEditorialMotion
    ? editorialKenBurnsFilter(
        slide,
        index,
        seed,
        fps,
        width,
        height,
        holdFrames,
      )
    : legacyKenBurnsFilter(slide, index, seed, fps, width, height, holdFrames);
}

function imagePreparationFilter(
  slide: SlideVideoManifest['slides'][number],
  width: number,
  height: number,
  supersample: number,
): string {
  const targetWidth = width * supersample;
  const targetHeight = height * supersample;
  const flags = 'lanczos+accurate_rnd';
  const layout =
    slide.asset.kind === 'remoteImage' ? slide.asset.layout : 'fullBleed';
  const hasExplicitEditorialMotion = editorialMotionOf(slide) !== undefined;
  if (hasExplicitEditorialMotion || layout === 'contain') {
    return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=${flags}:in_range=pc:out_range=tv:out_color_matrix=bt709,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=0x101014`;
  }
  return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase:flags=${flags}:in_range=pc:out_range=tv:out_color_matrix=bt709,crop=${targetWidth}:${targetHeight}`;
}

function slideSceneFilters(
  slides: SlideVideoManifest['slides'],
  seed: number,
  fps: number,
  width: number,
  height: number,
  supersample: number,
  transitionMs: number,
  indexOffset = 0,
): string[] {
  const holdFrames =
    Math.round((transitionMs * fps) / 1_000) + KEN_BURNS_HOLD_SAFETY_FRAMES;
  return slides.map((slide, index) => {
    const absoluteIndex = index + indexOffset;
    const drift = editorialDriftFilter(
      slide,
      absoluteIndex,
      seed,
      fps,
      width,
      height,
      holdFrames,
    );
    return `[${index}:v]${imagePreparationFilter(slide, width, height, supersample)},${kenBurnsFilter(slide, absoluteIndex, seed, fps, width, height, holdFrames)}${drift ? `,${drift}` : ''},setsar=1,format=yuv444p,settb=expr=1/${fps},setpts=N[s${index}]`;
  });
}

function sceneChain(
  manifest: Pick<SlideVideoManifest, 'slides' | 'clip' | 'episode'>,
  width: number,
  height: number,
  supersample: number,
  indexOffset = 0,
): { filters: string[]; priorLabel: string } {
  const fps = manifest.clip.fps;
  const filters = slideSceneFilters(
    manifest.slides,
    kenBurnsSeedForEpisode(manifest.episode.id),
    fps,
    width,
    height,
    supersample,
    manifest.clip.transitionMs,
    indexOffset,
  );
  const priorLabel = appendXfadeChain(
    filters,
    manifest.slides,
    fps,
    manifest.clip.transitionMs,
  );
  return { filters, priorLabel };
}

// Editorial scenes wipe in alternating directions; legacy payloads keep the
// historical crossfade so their look does not change retroactively.
function transitionForSlide(
  slide: SlideVideoManifest['slides'][number],
  slideIndex: number,
): string {
  if (editorialMotionOf(slide) === undefined) return 'fade';
  return slideIndex % 2 === 0 ? 'smoothright' : 'smoothleft';
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
    const transition = transitionForSlide(slide, slideIndex);
    filters.push(
      `[${priorLabel}][s${slideIndex}]xfade=transition=${transition}:duration=${transitionMs / 1_000}:offset=${transitionOffset.toFixed(6)}[${outputLabel}]`,
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
    1,
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

export interface VerticalMediaChunk {
  startIndex: number;
  endIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export function planVerticalMediaChunks(
  manifest: VerticalVideoManifest,
  chunkSize: number = VERTICAL_MEDIA_CHUNK_SIZE,
): VerticalMediaChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`Vertical media chunk size must be a positive integer`);
  }
  const chunks: VerticalMediaChunk[] = [];
  for (
    let startIndex = 0;
    startIndex < manifest.slides.length;
    startIndex += chunkSize
  ) {
    const endIndex = Math.min(startIndex + chunkSize, manifest.slides.length);
    const first = manifest.slides[startIndex];
    const last = manifest.slides[endIndex - 1];
    if (!first || !last) continue;
    chunks.push({
      startIndex,
      endIndex,
      startMs: first.startMs,
      endMs: last.endMs,
      durationMs: last.endMs - first.startMs,
    });
  }
  return chunks;
}

function verticalChunkHoldFrames(clip: VerticalVideoManifest['clip']): number {
  return (
    Math.round((clip.transitionMs * clip.fps) / 1_000) +
    KEN_BURNS_HOLD_SAFETY_FRAMES
  );
}

function verticalMediaChunkFrameCount(
  manifest: VerticalVideoManifest,
  chunk: VerticalMediaChunk,
): number {
  return (
    Math.round((chunk.durationMs * manifest.clip.fps) / 1_000) +
    verticalChunkHoldFrames(manifest.clip)
  );
}

export function buildVerticalMediaChunkFilter(
  manifest: VerticalVideoManifest,
  chunk: VerticalMediaChunk,
): string {
  const slides = manifest.slides
    .slice(chunk.startIndex, chunk.endIndex)
    .map((slide) => ({
      ...slide,
      startMs: slide.startMs - chunk.startMs,
      endMs: slide.endMs - chunk.startMs,
    }));
  if (slides.length === 0) {
    throw new Error('Vertical media chunk cannot be empty');
  }

  const fps = manifest.clip.fps;
  const { filters, priorLabel } = sceneChain(
    { slides, clip: manifest.clip, episode: manifest.episode },
    manifest.mediaWindow.width,
    manifest.mediaWindow.height,
    MEDIA_MOTION_SUPERSAMPLE,
    chunk.startIndex,
  );
  const totalFrames = verticalMediaChunkFrameCount(manifest, chunk);
  const holdSeconds = verticalChunkHoldFrames(manifest.clip) / fps;
  filters.push(
    `[${priorLabel}]fps=${fps},tpad=stop_mode=clone:stop_duration=${holdSeconds.toFixed(6)},trim=end_frame=${totalFrames},settb=expr=1/${fps},setpts=N,format=yuv420p[vout]`,
  );
  return filters.join(';\n');
}

const OUTRO_FADE_IN_SECONDS = 0.4;
const BGM_FADE_OUT_SECONDS = 0.9;
const BGM_DUCK_SIDECHAIN =
  'sidechaincompress=threshold=0.02:ratio=12:attack=25:release=450';

function appendVerticalPresentationFilters(
  filters: string[],
  manifest: VerticalVideoManifest,
  subtitlePath: string,
  fontsDirectory: string,
  mediaLabel: string,
  frameInputIndex: number,
): void {
  const fps = manifest.clip.fps;
  const window = manifest.mediaWindow;
  const totalFrames = Math.round((manifest.clip.durationMs * fps) / 1_000);
  const totalSeconds = manifest.clip.durationMs / 1_000;
  const narrationSeconds = manifest.audio.narrationDurationMs / 1_000;
  const totalSamples = Math.round((manifest.clip.durationMs / 1_000) * 48_000);
  const outroInputIndex = frameInputIndex + 1;
  const narrationInputIndex = frameInputIndex + 2;
  const bgmInputIndex = frameInputIndex + 3;

  filters.push(
    `[${mediaLabel}]fps=${fps},tpad=stop_mode=clone:stop_duration=${totalSeconds},trim=end_frame=${totalFrames},settb=expr=1/${fps},setpts=N,pad=${manifest.clip.width}:${manifest.clip.height}:${window.x}:${window.y}:color=0x101014[canvas]`,
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
}

export function buildVerticalChunkedFinalFilter(
  manifest: VerticalVideoManifest,
  chunks: readonly VerticalMediaChunk[],
  subtitlePath: string,
  fontsDirectory: string,
): string {
  if (chunks.length === 0) {
    throw new Error('Vertical render needs at least one media chunk');
  }
  const fps = manifest.clip.fps;
  const transitionFrames = Math.round(
    (manifest.clip.transitionMs * fps) / 1_000,
  );
  const filters = chunks.map(
    (_chunk, index) =>
      `[${index}:v]fps=${fps},setsar=1,format=yuv420p,settb=expr=1/${fps},setpts=N[c${index}]`,
  );
  let priorLabel = 'c0';
  chunks.slice(1).forEach((chunk, offsetIndex) => {
    const index = offsetIndex + 1;
    const startFrame = Math.round((chunk.startMs * fps) / 1_000);
    const transitionOffset = (startFrame - transitionFrames) / fps;
    const outputLabel = `cx${index}`;
    filters.push(
      `[${priorLabel}][c${index}]xfade=transition=fade:duration=${manifest.clip.transitionMs / 1_000}:offset=${transitionOffset.toFixed(6)}[${outputLabel}]`,
    );
    priorLabel = outputLabel;
  });
  appendVerticalPresentationFilters(
    filters,
    manifest,
    subtitlePath,
    fontsDirectory,
    priorLabel,
    chunks.length,
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

function stillImageInputs(paths: readonly string[]): string[] {
  return paths.flatMap((path) => ['-i', path]);
}

const X264_PRESET = 'veryfast';
const X264_CRF = '20';
const INTERMEDIATE_X264_CRF = '18';

function videoCodecArgs(fps: number, crf: string): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    X264_PRESET,
    '-crf',
    crf,
    '-tune',
    'stillimage',
    '-profile:v',
    'high',
    '-level:v',
    '4.1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
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
  ];
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
    ...videoCodecArgs(input.fps, X264_CRF),
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

function streamedRenderPrefix(): string[] {
  return [
    '-y',
    HIDE_BANNER_FLAG,
    '-loglevel',
    'warning',
    '-stats',
    '-progress',
    'pipe:1',
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
    ...streamedRenderPrefix(),
    ...stillImageInputs(input.imagePaths),
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

export function buildVerticalMediaChunkFfmpegArgs(
  options: VerticalSlideVideoOptions,
  chunk: VerticalMediaChunk,
  outputPath: string,
): string[] {
  const { manifest } = options;
  const mediaPaths = options.mediaPaths.slice(chunk.startIndex, chunk.endIndex);
  const expected = chunk.endIndex - chunk.startIndex;
  if (mediaPaths.length !== expected) {
    throw new Error(
      `Vertical media chunk needs ${expected} inputs, received ${mediaPaths.length}`,
    );
  }
  const chunkFrames = verticalMediaChunkFrameCount(manifest, chunk);
  return [
    ...streamedRenderPrefix(),
    ...stillImageInputs(mediaPaths),
    '-filter_complex',
    buildVerticalMediaChunkFilter(manifest, chunk),
    '-map',
    '[vout]',
    '-frames:v',
    String(chunkFrames),
    '-t',
    (chunkFrames / manifest.clip.fps).toFixed(6),
    ...videoCodecArgs(manifest.clip.fps, INTERMEDIATE_X264_CRF),
    '-an',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

export function buildVerticalChunkedFinalFfmpegArgs(
  options: VerticalSlideVideoOptions,
  chunks: readonly VerticalMediaChunk[],
  chunkPaths: readonly string[],
): string[] {
  if (chunks.length !== chunkPaths.length) {
    throw new Error(
      `Vertical render planned ${chunks.length} chunks but received ${chunkPaths.length} chunk files`,
    );
  }
  const { manifest } = options;
  return [
    ...streamedRenderPrefix(),
    ...chunkPaths.flatMap((path) => ['-i', path]),
    ...stillImageInputs([options.framePath]),
    ...loopedImageInputs([options.outroPath], manifest.clip.fps),
    '-i',
    options.audioSource,
    '-stream_loop',
    '-1',
    '-i',
    options.bgmPath,
    '-filter_complex',
    buildVerticalChunkedFinalFilter(
      manifest,
      chunks,
      options.subtitlePath,
      options.fontsDirectory,
    ),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-frames:v',
    String(Math.round((manifest.clip.durationMs * manifest.clip.fps) / 1_000)),
    '-t',
    String(manifest.clip.durationMs / 1_000),
    '-shortest',
    ...videoCodecArgs(manifest.clip.fps, X264_CRF),
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

async function runRenderPass(
  args: string[],
  signal: AbortSignal | undefined,
  ffmpegPath: string,
  processRunner: VideoProcessRunner,
  encode?: {
    totalDurationMs: number;
    onFraction: (fraction: number) => void;
  },
): Promise<void> {
  await invokeProcessRunner(
    processRunner,
    ffmpegPath,
    args,
    true,
    signal,
    encode
      ? createFfmpegEncodeProgressReader(
          encode.totalDurationMs,
          encode.onFraction,
          signal,
        )
      : undefined,
  );
}

async function renderWithFfmpeg(
  args: string[],
  signal: AbortSignal | undefined,
  ffmpegPath: string,
  processRunner: VideoProcessRunner,
  encode?: {
    totalDurationMs: number;
    onFraction: (fraction: number) => void;
  },
): Promise<void> {
  await assertVideoFfmpegCapabilities(ffmpegPath, processRunner, signal);
  await runRenderPass(args, signal, ffmpegPath, processRunner, encode);
}

function encodeProgressOptions(
  options: StaticSlideVideoOptions | VerticalSlideVideoOptions,
):
  | { totalDurationMs: number; onFraction: (fraction: number) => void }
  | undefined {
  const onFraction = options.onEncodeProgress;
  if (!onFraction) return undefined;
  return { totalDurationMs: options.manifest.clip.durationMs, onFraction };
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
    encodeProgressOptions(options),
  );
}

export async function renderVerticalSlideVideo(
  options: VerticalSlideVideoOptions,
  ffmpegPath = resolveVideoFfmpegPath(),
  processRunner: VideoProcessRunner = runProcess,
): Promise<{ chunkEncodeMs: number; finalEncodeMs: number }> {
  throwIfAborted(options.signal);
  if (options.mediaPaths.length !== options.manifest.slides.length) {
    throw new Error(
      `Vertical render needs ${options.manifest.slides.length} media inputs, received ${options.mediaPaths.length}`,
    );
  }

  const chunks = planVerticalMediaChunks(options.manifest);
  const chunkPaths = chunks.map(
    (_chunk, index) =>
      `${options.outputPath}.media-chunk-${String(index + 1).padStart(2, '0')}.mp4`,
  );
  await assertVideoFfmpegCapabilities(
    ffmpegPath,
    processRunner,
    options.signal,
  );

  const chunkProgressWeight = 0.75;
  try {
    const chunkEncodeStartedAtMs = Date.now();
    for (const [index, chunk] of chunks.entries()) {
      throwIfAborted(options.signal);
      await runRenderPass(
        buildVerticalMediaChunkFfmpegArgs(options, chunk, chunkPaths[index]!),
        options.signal,
        ffmpegPath,
        processRunner,
        options.onEncodeProgress
          ? {
              totalDurationMs: chunk.durationMs,
              onFraction: (fraction) =>
                options.onEncodeProgress?.(
                  ((index + fraction) / chunks.length) * chunkProgressWeight,
                ),
            }
          : undefined,
      );
    }
    const chunkEncodeMs = Date.now() - chunkEncodeStartedAtMs;

    const finalEncodeStartedAtMs = Date.now();
    await runRenderPass(
      buildVerticalChunkedFinalFfmpegArgs(options, chunks, chunkPaths),
      options.signal,
      ffmpegPath,
      processRunner,
      options.onEncodeProgress
        ? {
            totalDurationMs: options.manifest.clip.durationMs,
            onFraction: (fraction) =>
              options.onEncodeProgress?.(
                chunkProgressWeight + fraction * (1 - chunkProgressWeight),
              ),
          }
        : undefined,
    );
    const finalEncodeMs = Date.now() - finalEncodeStartedAtMs;
    return { chunkEncodeMs, finalEncodeMs };
  } finally {
    await Promise.all(chunkPaths.map(removeIntermediateFile));
  }
}

async function removeIntermediateFile(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // Best-effort cleanup; the caller removes the render directory as well.
  }
}
