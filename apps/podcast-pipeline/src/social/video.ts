import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { BRAND_CTA_VERSION } from '../brand/cta.js';
import {
  resolveVideoFfmpegPath,
  runProcess,
  type VideoProcessRunner,
} from '../services/video/ffmpeg-video.js';
import { OUTRO_TAIL_MS } from '../services/video/manifest.js';
import type { SocialLanguageCode } from './types.js';

const SOCIAL_TEMP_DIR = join(tmpdir(), 'zap-pilot-social');
export const X_VIDEO_LIMIT_SECONDS = 140;
export const X_TEASER_CONTENT_SECONDS = 130;

export interface PreparedVideo {
  path: string;
  sizeBytes: number;
  reused: boolean;
}

export function xTeaserDurationSeconds(fullDurationSeconds: number): number {
  if (fullDurationSeconds <= X_VIDEO_LIMIT_SECONDS) return fullDurationSeconds;
  return X_TEASER_CONTENT_SECONDS + OUTRO_TAIL_MS / 1_000;
}

export function socialVideoCacheIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export async function prepareSocialVideo(input: {
  episodeId: string;
  languageCode?: SocialLanguageCode;
  url: string;
}): Promise<PreparedVideo> {
  await mkdir(SOCIAL_TEMP_DIR, { recursive: true });
  const safeEpisodeId = safeId(input.episodeId);
  const sourceIdentity = socialVideoCacheIdentity(input.url);
  const outputPath = join(
    SOCIAL_TEMP_DIR,
    `episode-${safeEpisodeId}-${sourceIdentity}-${input.languageCode ?? 'zh-Hant'}.mp4`,
  );
  const cached = await reusablePreparedVideo(outputPath);
  if (cached) return cached;

  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download social video (${response.status} ${response.statusText}).`,
    );
  }
  if (!response.body) {
    throw new Error('Downloaded social video is empty.');
  }

  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  return prepareAtomicVideo({
    temporaryPath,
    outputPath,
    emptyMessage: 'Downloaded social video is empty.',
    write: async () => {
      await pipeline(
        Readable.fromWeb(response.body as NodeReadableStream),
        createWriteStream(temporaryPath),
      );
    },
  });
}

export async function prepareXTeaserVideo(input: {
  episodeId: string;
  sourcePath: string;
  durationSeconds: number;
  ffmpegPath?: string;
  processRunner?: VideoProcessRunner;
}): Promise<PreparedVideo> {
  const source = await stat(input.sourcePath);
  if (!source.isFile() || source.size <= 0) {
    throw new Error('X teaser source video is missing or empty.');
  }
  if (input.durationSeconds <= X_VIDEO_LIMIT_SECONDS) {
    return { path: input.sourcePath, sizeBytes: source.size, reused: true };
  }

  await mkdir(SOCIAL_TEMP_DIR, { recursive: true });
  const sourceIdentity = socialVideoCacheIdentity(input.sourcePath);
  const outputPath = join(
    SOCIAL_TEMP_DIR,
    `episode-${safeId(input.episodeId)}-x-${sourceIdentity}-${BRAND_CTA_VERSION}.mp4`,
  );
  const cached = await reusablePreparedVideo(outputPath);
  if (cached) return cached;

  const outroSeconds = OUTRO_TAIL_MS / 1_000;
  const outroStart = Math.max(
    X_TEASER_CONTENT_SECONDS,
    input.durationSeconds - outroSeconds,
  );
  const filter = [
    `[0:v]trim=start=0:end=${X_TEASER_CONTENT_SECONDS},setpts=PTS-STARTPTS[v0]`,
    `[0:a]atrim=start=0:end=${X_TEASER_CONTENT_SECONDS},asetpts=PTS-STARTPTS[a0]`,
    `[0:v]trim=start=${outroStart.toFixed(3)},setpts=PTS-STARTPTS[v1]`,
    `[0:a]atrim=start=${outroStart.toFixed(3)},asetpts=PTS-STARTPTS[a1]`,
    '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
  ].join(';');
  const temporaryPath = `${outputPath}.tmp-${process.pid}.mp4`;
  const processRunner = input.processRunner ?? runProcess;

  return prepareAtomicVideo({
    temporaryPath,
    outputPath,
    emptyMessage: 'Rendered X teaser video is empty.',
    write: async () => {
      await processRunner(input.ffmpegPath ?? resolveVideoFfmpegPath(), [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        input.sourcePath,
        '-filter_complex',
        filter,
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-y',
        temporaryPath,
      ]);
    },
  });
}

async function reusablePreparedVideo(
  path: string,
): Promise<PreparedVideo | null> {
  const file = await stat(path).catch(() => null);
  if (!file?.isFile() || file.size <= 0) return null;
  return { path, sizeBytes: file.size, reused: true };
}

async function prepareAtomicVideo(input: {
  temporaryPath: string;
  outputPath: string;
  emptyMessage: string;
  write: () => Promise<void>;
}): Promise<PreparedVideo> {
  try {
    await input.write();
    const file = await stat(input.temporaryPath);
    if (file.size === 0) throw new Error(input.emptyMessage);
    await rename(input.temporaryPath, input.outputPath);
    return { path: input.outputPath, sizeBytes: file.size, reused: false };
  } catch (error) {
    await unlink(input.temporaryPath).catch(() => null);
    throw error;
  }
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
