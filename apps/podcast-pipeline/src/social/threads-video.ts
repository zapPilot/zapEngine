import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

import { BRAND_CTA_VERSION } from '../brand/cta.js';
import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import {
  resolveVideoFfmpegPath,
  runProcess,
  type VideoProcessRunner,
} from '../services/video/ffmpeg-video.js';
import { OUTRO_TAIL_MS } from '../services/video/manifest.js';
import { X_TEASER_CONTENT_SECONDS } from './video.js';

const DEFAULT_TEMP_DIR = join(tmpdir(), 'zap-pilot-social');
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const MULTIPART_QUEUE_SIZE = 2;
const OUTRO_SECONDS = OUTRO_TAIL_MS / 1_000;
const THREADS_TEASER_SECONDS = X_TEASER_CONTENT_SECONDS + OUTRO_SECONDS;

interface ThreadsVideoPreparationOptions {
  preparedVideoPath?: string;
  tempDir?: string;
  fetchImpl?: typeof fetch;
  processRunner?: VideoProcessRunner;
  ffmpegPath?: string;
  uploadVideo?: (input: { path: string; key: string }) => Promise<void>;
  publicBaseUrl?: string;
}

/**
 * Threads rejects long podcast videos during Meta-side processing. Publish the
 * same deterministic teaser shape used by X instead: the first 130 seconds plus
 * the source video's final 2.8-second brand outro. When X already prepared that
 * teaser, reuse it verbatim and only upload a public R2 copy for Threads.
 */
export async function prepareThreadsVideoUrl(
  rawVideoUrl: string,
  options: ThreadsVideoPreparationOptions = {},
): Promise<string> {
  const sourceUrl = requirePublicHttpsUrl(rawVideoUrl);
  const sourceHash = createHash('sha256')
    .update(sourceUrl.href)
    .digest('hex')
    .slice(0, 24);
  const tempDir = options.tempDir ?? DEFAULT_TEMP_DIR;
  await mkdir(tempDir, { recursive: true });

  const teaserPath = options.preparedVideoPath
    ? await requireNonemptyFile(options.preparedVideoPath)
    : await prepareTeaserFromRemoteSource({
        sourceUrl: sourceUrl.href,
        sourceHash,
        tempDir,
        fetchImpl: options.fetchImpl ?? fetch,
        processRunner: options.processRunner ?? runProcess,
        ffmpegPath: options.ffmpegPath ?? resolveVideoFfmpegPath(),
      });

  const key = `social/threads/${sourceHash}/${BRAND_CTA_VERSION}/video.mp4`;
  const uploadVideo = options.uploadVideo ?? uploadVideoToR2;
  await uploadVideo({ path: teaserPath, key });

  const publicBase = trimTrailingSlash(
    options.publicBaseUrl ?? getRequiredEnv('R2_PUBLIC_BASE_URL'),
  );
  return `${publicBase}/${key}`;
}

async function prepareTeaserFromRemoteSource(input: {
  sourceUrl: string;
  sourceHash: string;
  tempDir: string;
  fetchImpl: typeof fetch;
  processRunner: VideoProcessRunner;
  ffmpegPath: string;
}): Promise<string> {
  const sourcePath = join(
    input.tempDir,
    `threads-${input.sourceHash}-source.mp4`,
  );
  if (!(await isNonemptyFile(sourcePath))) {
    const response = await input.fetchImpl(input.sourceUrl);
    if (!response.ok || !response.body) {
      throw new Error(
        `Threads teaser source download failed: HTTP ${response.status}.`,
      );
    }
    await writeAtomicFile(sourcePath, async (temporaryPath) => {
      await pipeline(
        Readable.fromWeb(response.body as NodeReadableStream),
        createWriteStream(temporaryPath),
      );
    });
  }

  const teaserPath = join(
    input.tempDir,
    `threads-${input.sourceHash}-${BRAND_CTA_VERSION}.mp4`,
  );
  if (await isNonemptyFile(teaserPath)) return teaserPath;

  const filter = [
    `[0:v]trim=start=0:end=${X_TEASER_CONTENT_SECONDS},setpts=PTS-STARTPTS[v0]`,
    `[0:a]atrim=start=0:end=${X_TEASER_CONTENT_SECONDS},asetpts=PTS-STARTPTS[a0]`,
    `[1:v]trim=start=0:end=${OUTRO_SECONDS},setpts=PTS-STARTPTS[v1]`,
    `[1:a]atrim=start=0:end=${OUTRO_SECONDS},asetpts=PTS-STARTPTS[a1]`,
    '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
  ].join(';');

  await writeAtomicFile(teaserPath, async (temporaryPath) => {
    await input.processRunner(input.ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      sourcePath,
      '-sseof',
      `-${OUTRO_SECONDS}`,
      '-i',
      sourcePath,
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
      '-t',
      String(THREADS_TEASER_SECONDS),
      '-y',
      temporaryPath,
    ]);
  });

  return teaserPath;
}

async function writeAtomicFile(
  outputPath: string,
  write: (temporaryPath: string) => Promise<void>,
): Promise<void> {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    await write(temporaryPath);
    await requireNonemptyFile(temporaryPath);
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => null);
    throw error;
  }
}

async function requireNonemptyFile(path: string): Promise<string> {
  const file = await stat(path).catch(() => null);
  if (!file?.isFile() || file.size <= 0) {
    throw new Error(`Threads teaser video is missing or empty: ${path}`);
  }
  return path;
}

async function isNonemptyFile(path: string): Promise<boolean> {
  const file = await stat(path).catch(() => null);
  return Boolean(file?.isFile() && file.size > 0);
}

// jscpd:ignore-start — URL validation intentionally mirrors the API boundary guard in threads.ts.
function requirePublicHttpsUrl(rawValue: string): URL {
  let url: URL;
  try {
    url = new URL(rawValue.trim());
  } catch (error) {
    throw new Error('Threads video URL must be a valid public HTTPS URL.', {
      cause: error,
    });
  }
  if (url.protocol !== 'https:') {
    throw new Error('Threads video URL must be a valid public HTTPS URL.');
  }
  return url;
}
// jscpd:ignore-end

// jscpd:ignore-start — keep the small social upload boundary local instead of coupling it to video storage manifests.
async function uploadVideoToR2(input: {
  path: string;
  key: string;
}): Promise<void> {
  const client = new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });
  const upload = new Upload({
    client,
    params: {
      Bucket: getRequiredEnv('R2_BUCKET_NAME'),
      Key: input.key,
      Body: createReadStream(input.path),
      ContentType: 'video/mp4',
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    },
    partSize: MULTIPART_PART_SIZE,
    queueSize: MULTIPART_QUEUE_SIZE,
    leavePartsOnError: false,
  });
  await upload.done();
}
// jscpd:ignore-end

export { THREADS_TEASER_SECONDS };
