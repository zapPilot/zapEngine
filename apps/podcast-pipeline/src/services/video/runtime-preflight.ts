import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import {
  assertVideoFfmpegCapabilities,
  resolveVideoFfmpegPath,
  runProcess,
  type VideoProcessRunner,
} from './ffmpeg-video.js';
import { videoAssetPaths } from './runtime-assets.js';
import {
  createAssSubtitles,
  PORTRAIT_SUBTITLE_LAYOUT,
} from './subtitles.js';

const SUBTITLE_SMOKE_DURATION_SECONDS = 1;
const SUBTITLE_SMOKE_FRAME_SECONDS = 0.5;
const SUBTITLE_SMOKE_MIN_VISIBLE_CHANNEL = 64;

interface VideoRenderRuntimeDependencies {
  accessFile(path: string): Promise<void>;
  makeTemporaryDirectory(prefix: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  removeDirectory(path: string): Promise<void>;
  processRunner: VideoProcessRunner;
  readFrameMaxChannel(path: string): Promise<number>;
}

const defaultDependencies: VideoRenderRuntimeDependencies = {
  accessFile: async (path) => access(path),
  makeTemporaryDirectory: (prefix) => mkdtemp(prefix),
  writeText: (path, content) => writeFile(path, content, 'utf8'),
  removeDirectory: (path) => rm(path, { recursive: true, force: true }),
  processRunner: runProcess,
  readFrameMaxChannel: async (path) => {
    const stats = await sharp(path).stats();
    return Math.max(...stats.channels.slice(0, 3).map((channel) => channel.max));
  },
};

export interface VideoRenderRuntimeReport {
  ffmpegPath: string;
  fontsDirectory: string;
  subtitleBurnInVerified: boolean;
  subtitleFrameMaxChannel: number | null;
}

export async function assertVideoRenderRuntime(
  options: {
    ffmpegPath?: string;
    verifySubtitleBurnIn?: boolean;
    dependencies?: Partial<VideoRenderRuntimeDependencies>;
  } = {},
): Promise<VideoRenderRuntimeReport> {
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const ffmpegPath = options.ffmpegPath ?? resolveVideoFfmpegPath();

  await Promise.all([
    dependencies.accessFile(videoAssetPaths.notoSansCjkTcRegular),
    dependencies.accessFile(videoAssetPaths.notoSansCjkTcBold),
  ]);
  await assertVideoFfmpegCapabilities(ffmpegPath, dependencies.processRunner);

  if (!options.verifySubtitleBurnIn) {
    return {
      ffmpegPath,
      fontsDirectory: videoAssetPaths.fontsDirectory,
      subtitleBurnInVerified: false,
      subtitleFrameMaxChannel: null,
    };
  }

  const outputDirectory = await dependencies.makeTemporaryDirectory(
    join(tmpdir(), 'podcast-subtitle-smoke-'),
  );
  const subtitlePath = join(outputDirectory, 'captions.ass');
  const videoPath = join(outputDirectory, 'subtitle-smoke.mp4');
  const framePath = join(outputDirectory, 'subtitle-smoke.png');

  try {
    await dependencies.writeText(
      subtitlePath,
      createAssSubtitles(
        [{ startMs: 0, endMs: 1_000, text: '字幕 Smoke 123' }],
        PORTRAIT_SUBTITLE_LAYOUT,
      ),
    );

    const subtitleFilter = `ass=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(videoAssetPaths.fontsDirectory)}'`;
    await dependencies.processRunner(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${PORTRAIT_SUBTITLE_LAYOUT.playResX}x${PORTRAIT_SUBTITLE_LAYOUT.playResY}:r=24:d=${SUBTITLE_SMOKE_DURATION_SECONDS}`,
      '-vf',
      subtitleFilter,
      '-an',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      videoPath,
    ]);
    await dependencies.processRunner(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(SUBTITLE_SMOKE_FRAME_SECONDS),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      framePath,
    ]);

    const subtitleFrameMaxChannel =
      await dependencies.readFrameMaxChannel(framePath);
    if (subtitleFrameMaxChannel <= SUBTITLE_SMOKE_MIN_VISIBLE_CHANNEL) {
      throw new Error(
        `FFmpeg subtitle burn-in smoke produced no visible subtitle pixels (max channel ${subtitleFrameMaxChannel})`,
      );
    }

    return {
      ffmpegPath,
      fontsDirectory: videoAssetPaths.fontsDirectory,
      subtitleBurnInVerified: true,
      subtitleFrameMaxChannel,
    };
  } finally {
    await dependencies.removeDirectory(outputDirectory);
  }
}

function escapeFilterPath(path: string): string {
  return path
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'");
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === fileURLToPath(import.meta.url));
}

if (isDirectExecution()) {
  const report = await assertVideoRenderRuntime({ verifySubtitleBurnIn: true });
  console.info(
    `[video-runtime] subtitle burn-in verified ffmpeg=${report.ffmpegPath} fonts=${report.fontsDirectory} maxChannel=${report.subtitleFrameMaxChannel ?? 'n/a'}`,
  );
}
