import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

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

// Streamed runs are long (a full render) and ffmpeg's -stats writes a line per
// second, so the retained copy has to be bounded. Keeping the tail is what
// matters: it holds the error ffmpeg printed just before it died.
const STREAMED_OUTPUT_TAIL_LIMIT = 8_000;

interface SlideVideoRenderOptionsBase {
  audioSource: string;
  filterScriptPath: string;
  outputPath: string;
  signal?: AbortSignal;
  /** Fraction 0..1 of the encode, from ffmpeg's own output clock. */
  onEncodeProgress?: (fraction: number) => void;
}

export interface StaticSlideVideoOptions extends SlideVideoRenderOptionsBase {
  manifest: SlideVideoManifest;
  slidePaths: string[];
}

export interface VerticalSlideVideoOptions extends SlideVideoRenderOptionsBase {
  manifest: VerticalVideoManifest;
  mediaPaths: string[];
  framePath: string;
  outroPath: string;
  bgmPath: string;
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
  // The arity branches below are load-bearing: injected test doubles assert the
  // exact argument shape they are called with, so a caller that wants none of
  // the optional arguments must still be invoked with none of them.
  if (onStdoutLine) {
    return processRunner(executable, args, streamStdio, signal, onStdoutLine);
  }
  if (signal) return processRunner(executable, args, streamStdio, signal);
  return streamStdio
    ? processRunner(executable, args, true)
    : processRunner(executable, args);
}

/**
 * `streamStdio` relays the child's *stderr* to this process as it arrives — the
 * render needs its progress visible in the service log — while still retaining a
 * bounded tail of both streams. The previous `stdio: 'inherit'` gave up the
 * retained copy entirely, so a failed render threw
 * `ffmpeg failed (signal SIGKILL): ` with nothing after the colon.
 *
 * Stdout is deliberately not relayed in this mode: renders pass
 * `-progress pipe:1`, which makes it a machine stream. Pass `onStdoutLine` to
 * consume it line by line instead.
 */
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
        // Renders pass `-progress pipe:1`, so child stdout is a machine stream
        // of ~24 key=value lines per second. Relaying it would bury the service
        // log; the bounded tail is still kept for failure diagnostics.
        stdout = boundedTail(stdout, chunk);
        if (onStdoutLine) {
          stdoutResidual = consumeLines(stdoutResidual, chunk, onStdoutLine);
        }
        return;
      }
      // Capability probes regex over the whole of `ffmpeg -filters`, so the
      // non-streaming path must keep every byte.
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

/**
 * Microseconds of output written so far, from one `-progress` line.
 *
 * ffmpeg's `out_time_ms` key is a long-standing misnomer: it carries the same
 * microsecond value as `out_time_us`. Dividing it by 1000 would report an encode
 * as 0.1% done for its entire run.
 */
export function parseFfmpegProgressOutTimeUs(line: string): number | null {
  const match = /^out_time_(?:us|ms)=(-?\d+)$/.exec(line.trim());
  if (!match?.[1]) return null;
  const microseconds = Number(match[1]);
  return Number.isFinite(microseconds) && microseconds >= 0
    ? microseconds
    : null;
}

/**
 * Turns `-progress` lines into a monotonic 0..1 fraction of the encode.
 * `out_time_us=N/A` appears before the first frame is written, and `progress=end`
 * is ffmpeg's own statement that the output is complete.
 */
export function createFfmpegEncodeProgressReader(
  totalDurationMs: number,
  onFraction: (fraction: number) => void,
): (line: string) => void {
  const totalUs = totalDurationMs * 1_000;
  let highWaterMark = 0;
  return (line) => {
    if (line.trim() === 'progress=end') {
      // A fast encode can have its last out_time sample already reach the end,
      // in which case the end marker would emit a duplicate 1.
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

/**
 * Emits every complete line in `chunk` and returns the trailing partial line, so
 * a `key=value` pair split across two stream chunks is still parsed once.
 */
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
  // The Linux OOM killer prints nothing the child can capture. An unrequested
  // SIGKILL during a render is almost always the kernel reclaiming memory, and
  // saying so is the difference between a diagnosable failure and a dead end.
  const hint = signal === 'SIGKILL' ? ', likely out of memory' : '';
  const tail = stderr.trim();
  const summary = lastNonBlankLine(tail);
  // Telegram surfaces only the first line of a failure, so it has to stand on
  // its own; the full tail follows for the job's stored last_error.
  const firstLine = `${executable} failed (${how}${hint})${summary ? `: ${summary}` : ''}`;
  return new Error(
    tail && tail !== summary ? `${firstLine}\n${tail}` : firstLine,
  );
}

function lastNonBlankLine(value: string): string {
  // ffmpeg's -stats output overwrites itself with bare carriage returns, so
  // splitting on \n alone would return every progress update as one line.
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

// zoompan quantizes x/y and the crop size to integer pixels of its INPUT, so a
// pan across a window-sized input advances ~0.3px per frame and rounds into a
// visible stair-step. Media crops are therefore supplied at this multiple of
// the media window and zoompan's own `s=` performs the final downscale.
export const MEDIA_MOTION_SUPERSAMPLE = 4 as const;
// Zoom grows with scene length instead of being a fixed total, so short and
// long scenes move at the same perceived speed; the cap keeps 13s+ scenes calm.
const KEN_BURNS_ZOOM_RATE_PER_SECOND = 0.014;
const KEN_BURNS_MAX_EXTRA_ZOOM = 0.18;
// Pans hold a constant zoom and translate along one axis only: ramping zoom
// and position together doubles zoompan's rounding sources and reads as wobble.
const KEN_BURNS_PAN_ZOOM = 1.15;

export type KenBurnsPan =
  | 'zoomIn'
  | 'zoomOut'
  | 'leftToRight'
  | 'rightToLeft'
  | 'topToBottom';

// Zooms interleave with pans so xfade neighbors differ in motion character.
const KEN_BURNS_MOTIONS: readonly KenBurnsPan[] = [
  'zoomIn',
  'leftToRight',
  'zoomOut',
  'rightToLeft',
  'topToBottom',
];

// Same deterministic-variety pattern as pickBgmTrack: every locale of one
// episode shares a motion order, while different episodes start elsewhere in
// the rotation.
export function kenBurnsSeedForEpisode(episodeId: string): number {
  const digest = createHash('sha256').update(episodeId).digest();
  return (digest[0] ?? 0) % KEN_BURNS_MOTIONS.length;
}

export function kenBurnsPanForScene(index: number, seed = 0): KenBurnsPan {
  return (
    KEN_BURNS_MOTIONS[(index + seed) % KEN_BURNS_MOTIONS.length] ?? 'zoomIn'
  );
}

function kenBurnsFilter(
  slide: SlideVideoManifest['slides'][number],
  index: number,
  seed: number,
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
  // Smoothstep easing (3P²−2P³): velocity is zero at both endpoints, so
  // motion never pops across an xfade boundary.
  const eased = `pow(${progress}\\,2)*(3-2*${progress})`;
  const extraZoom = Math.min(
    (KEN_BURNS_ZOOM_RATE_PER_SECOND * (slide.endMs - slide.startMs)) / 1_000,
    KEN_BURNS_MAX_EXTRA_ZOOM,
  ).toFixed(4);

  const position =
    slide.asset.kind === 'remoteImage' ? slide.asset.position : 'center';
  let motion = kenBurnsPanForScene(index, seed);
  // A crop pinned to its top or bottom edge cannot pan vertically, and a
  // constant-zoom topToBottom there would be a static frame.
  if (motion === 'topToBottom' && position !== 'center') motion = 'zoomIn';
  const isPan = motion !== 'zoomIn' && motion !== 'zoomOut';

  let zoom = `1+${extraZoom}*${eased}`;
  if (motion === 'zoomOut') zoom = `1+${extraZoom}*(1-${eased})`;
  if (isPan) zoom = String(KEN_BURNS_PAN_ZOOM);

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

  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

function slideSceneFilters(
  slides: SlideVideoManifest['slides'],
  seed: number,
  fps: number,
  width: number,
  height: number,
  supersample: number,
): string[] {
  return slides.map(
    (slide, index) =>
      `[${index}:v]fps=${fps},scale=${width * supersample}:${height * supersample}:flags=lanczos+accurate_rnd:in_range=pc:out_range=tv:out_color_matrix=bt709,${kenBurnsFilter(slide, index, seed, fps, width, height)},setsar=1,format=yuv444p,settb=expr=1/${fps},setpts=N[s${index}]`,
  );
}

function sceneChain(
  manifest: Pick<SlideVideoManifest, 'slides' | 'clip' | 'episode'>,
  width: number,
  height: number,
  supersample: number,
): { filters: string[]; priorLabel: string } {
  const fps = manifest.clip.fps;
  const filters = slideSceneFilters(
    manifest.slides,
    kenBurnsSeedForEpisode(manifest.episode.id),
    fps,
    width,
    height,
    supersample,
  );
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
  // Legacy landscape rasters already arrive at output size; only vertical
  // media crops are supersampled for motion.
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
    MEDIA_MOTION_SUPERSAMPLE,
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

// Ken Burns stills plus burned-in captions gain almost nothing from x264's
// slower presets, and `slow` is what stalled production: a portrait render on
// a throttled shared vCPU encoded at 0.004x realtime before the OOM killer took
// ffmpeg. `veryfast` at crf 20 is visually equivalent on this material.
const X264_PRESET = 'veryfast';
const X264_CRF = '20';

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
    X264_PRESET,
    '-crf',
    X264_CRF,
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
    // `-stats` writes a human line to stderr that overwrites itself with bare
    // carriage returns; `-progress` writes parseable key=value pairs to stdout.
    // Both are kept: the first for `fly logs`, the second to drive the bar.
    '-progress',
    'pipe:1',
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
  encode?: {
    totalDurationMs: number;
    onFraction: (fraction: number) => void;
  },
): Promise<void> {
  await assertVideoFfmpegCapabilities(ffmpegPath, processRunner, signal);
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
        )
      : undefined,
  );
}

function encodeProgressOptions(
  options: StaticSlideVideoOptions | VerticalSlideVideoOptions,
):
  | { totalDurationMs: number; onFraction: (fraction: number) => void }
  | undefined {
  const onFraction = options.onEncodeProgress;
  if (!onFraction) return undefined;
  // The same clip.durationMs drives `-frames:v` and `-t`, so ffmpeg's output
  // clock genuinely reaches this value rather than approaching it.
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
): Promise<void> {
  throwIfAborted(options.signal);
  await renderWithFfmpeg(
    buildVerticalFfmpegArgs(options),
    options.signal,
    ffmpegPath,
    processRunner,
    encodeProgressOptions(options),
  );
}
