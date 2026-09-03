import { createReadStream } from 'node:fs';
import { basename } from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { mapWithConcurrency } from '../lib/concurrency.js';
import { contentTypeExtension } from '../lib/content-type.js';
import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { sleep } from '../lib/sleep.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import type { HlsFile } from './hls.js';
import { logPipelineEvent } from './ingest/step.js';

export interface HlsUploadResult {
  hlsUrl: string;
  r2Prefix: string;
}

export interface VideoArtifactUploadInput {
  episodeId: string;
  languageCode: LanguageClassroomLanguageCode;
  rendererVersion: string;
  manifestHash: string;
  videoPath: string;
  thumbnailPath: string;
  manifestPath: string;
  captionsPath: string;
  slidePaths: readonly string[];
  signal?: AbortSignal;
}

export interface VideoArtifactUploadResult {
  mp4Url: string;
  thumbnailUrl: string;
  manifestUrl: string;
  captionsAssUrl: string;
  r2Prefix: string;
}

export interface VisualSourceImageUpload {
  sceneId: string;
  path: string;
  contentType: 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface EpisodeVisualUploadInput {
  episodeId: string;
  visualVersion: string;
  visualHash: string;
  manifestPath: string;
  images: readonly VisualSourceImageUpload[];
  signal?: AbortSignal;
}

export interface EpisodeVisualUploadResult {
  manifestUrl: string;
  imageUrls: Record<string, string>;
  r2Prefix: string;
}

export interface EpisodeVisualCheckpointImageInput {
  episodeId: string;
  visualVersion: string;
  sourceHash: string;
  assetId: string;
  path: string;
  contentType: VisualSourceImageUpload['contentType'];
  signal?: AbortSignal;
}

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const VIDEO_MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const VIDEO_MULTIPART_QUEUE_SIZE = 2;

/**
 * R2 uploads retry here, not in the AWS SDK, because the SDK refuses outright:
 * `@smithy/core`'s retry middleware bails on any request whose body is a
 * `Readable` ("An error was encountered in a non-retryable streaming request"),
 * and `createReadStream` bodies are exactly that. So a single `EPIPE` on one of
 * an episode's ~100 HLS segments used to fail the whole step with zero attempts.
 * Each attempt therefore opens a *fresh* stream — a consumed one cannot be
 * replayed. Object keys are deterministic, so re-PUTting is safe.
 */
const R2_PUT_MAX_ATTEMPTS = 3;
const R2_PUT_BASE_DELAY_MS = 500;

/**
 * How many objects one upload call keeps in flight. HLS is `-hls_time 6`, so a
 * ten-minute episode is ~100 segments; opening all of them at once is what made
 * a transient socket error near-certain on every run.
 */
const R2_PUT_CONCURRENCY = 4;

const RETRYABLE_R2_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ETIMEDOUT',
]);
const RETRYABLE_R2_ERROR_NAMES = new Set([
  'RequestTimeout',
  'RequestTimeTooSkewed',
  'TimeoutError',
]);
const RETRYABLE_R2_STATUS = new Set([408, 429]);

let client: S3Client | null = null;
let bucket: string | null = null;
let publicBase: string | null = null;

function getR2Client(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });

  return client;
}

function getBucket(): string {
  bucket ??= getRequiredEnv('R2_BUCKET_NAME');
  return bucket;
}

function getPublicBase(): string {
  publicBase ??= trimTrailingSlash(getRequiredEnv('R2_PUBLIC_BASE_URL'));
  return publicBase;
}

export async function uploadHlsToR2(
  files: HlsFile[],
  episodeId: string,
  languageCode: string,
  section: 'main' | 'classroom',
  classroomTargetLanguageCode?: LanguageClassroomLanguageCode,
): Promise<HlsUploadResult> {
  if (classroomTargetLanguageCode !== undefined && section !== 'classroom') {
    throw new Error(
      'classroomTargetLanguageCode is only valid when section is "classroom"',
    );
  }

  const prefix =
    classroomTargetLanguageCode === undefined
      ? `episodes/${episodeId}/localizations/${languageCode}/${section}`
      : `episodes/${episodeId}/localizations/${languageCode}/${section}/${classroomTargetLanguageCode}`;
  const r2 = getR2Client();
  const Bucket = getBucket();

  // No CacheControl on purpose: this prefix carries no content hash, so a
  // resumed ingest rewrites the same keys and an immutable header would pin the
  // CDN to the previous audio.
  await mapWithConcurrency(
    files,
    R2_PUT_CONCURRENCY,
    ({ name, path, contentType }) =>
      putObject(r2, {
        Bucket,
        Key: `${prefix}/${name}`,
        path,
        contentType,
      }),
  );

  return {
    hlsUrl: `${getPublicBase()}/${prefix}/playlist.m3u8`,
    r2Prefix: prefix,
  };
}

export async function uploadVideoArtifactsToR2(
  input: VideoArtifactUploadInput,
): Promise<VideoArtifactUploadResult> {
  input.signal?.throwIfAborted();
  const prefix = buildVideoArtifactPrefix(input);
  const r2 = getR2Client();
  const Bucket = getBucket();
  const videoKey = `${prefix}/video.mp4`;
  const thumbnailKey = `${prefix}/thumbnail.png`;
  const manifestKey = `${prefix}/manifest.json`;
  const captionsKey = `${prefix}/captions.ass`;
  const slideKeys = input.slidePaths.map(
    (slidePath, index) =>
      `${prefix}/slides/${safeSlideFilename(slidePath, index)}`,
  );

  await uploadMp4({
    r2,
    Bucket,
    Key: videoKey,
    path: input.videoPath,
    signal: input.signal,
  });

  await putImmutableObjects(r2, Bucket, input.signal, [
    { Key: thumbnailKey, path: input.thumbnailPath, contentType: 'image/png' },
    {
      Key: manifestKey,
      path: input.manifestPath,
      contentType: 'application/json',
    },
    {
      Key: captionsKey,
      path: input.captionsPath,
      contentType: 'text/x-ssa; charset=utf-8',
    },
    ...input.slidePaths.map((slidePath, index) => ({
      Key: slideKeys[index]!,
      path: slidePath,
      contentType: 'image/png',
    })),
  ]);

  const base = getPublicBase();
  return {
    mp4Url: `${base}/${videoKey}`,
    thumbnailUrl: `${base}/${thumbnailKey}`,
    manifestUrl: `${base}/${manifestKey}`,
    captionsAssUrl: `${base}/${captionsKey}`,
    r2Prefix: prefix,
  };
}

export async function uploadEpisodeVisualCheckpointImageToR2(
  input: EpisodeVisualCheckpointImageInput,
): Promise<string> {
  input.signal?.throwIfAborted();
  const episodeId = safeKeySegment(input.episodeId, 'episode id');
  const visualVersion = safeKeySegment(
    input.visualVersion,
    'visual renderer version',
  );
  const sourceHash = safeKeySegment(input.sourceHash, 'visual source hash');
  const assetId = safeKeySegment(input.assetId, 'visual asset id');
  const extension = contentTypeExtension(input.contentType);
  const key = `episodes/${episodeId}/visuals/${visualVersion}/checkpoints/${sourceHash}/images/${assetId}.${extension}`;
  await putImmutableObjects(getR2Client(), getBucket(), input.signal, [
    { Key: key, path: input.path, contentType: input.contentType },
  ]);
  return `${getPublicBase()}/${key}`;
}

export async function uploadEpisodeVisualAssetsToR2(
  input: EpisodeVisualUploadInput,
): Promise<EpisodeVisualUploadResult> {
  input.signal?.throwIfAborted();
  const episodeId = safeKeySegment(input.episodeId, 'episode id');
  const visualVersion = safeKeySegment(
    input.visualVersion,
    'visual renderer version',
  );
  const visualHash = safeKeySegment(input.visualHash, 'visual hash');
  const prefix = `episodes/${episodeId}/visuals/${visualVersion}/${visualHash}`;
  const r2 = getR2Client();
  const Bucket = getBucket();
  const manifestKey = `${prefix}/visual-manifest.json`;
  const seenSceneIds = new Set<string>();
  const imageEntries = input.images.map((image) => {
    const sceneId = safeKeySegment(image.sceneId, 'visual scene id');
    if (seenSceneIds.has(sceneId)) {
      throw new Error(`Duplicate visual scene id: ${sceneId}`);
    }
    seenSceneIds.add(sceneId);
    const extension = contentTypeExtension(image.contentType);
    return {
      ...image,
      sceneId,
      key: `${prefix}/images/${sceneId}.${extension}`,
    };
  });

  // Up to 64 scenes at up to 25 MB each (MAX_REMOTE_IMAGE_BYTES in
  // video/assets.ts), so this is the fan-out that most needs a ceiling.
  await putImmutableObjects(r2, Bucket, input.signal, [
    {
      Key: manifestKey,
      path: input.manifestPath,
      contentType: 'application/json',
    },
    ...imageEntries.map((image) => ({
      Key: image.key,
      path: image.path,
      contentType: image.contentType,
    })),
  ]);

  const base = getPublicBase();
  return {
    manifestUrl: `${base}/${manifestKey}`,
    imageUrls: Object.fromEntries(
      imageEntries.map((image) => [image.sceneId, `${base}/${image.key}`]),
    ),
    r2Prefix: prefix,
  };
}

function buildVideoArtifactPrefix(input: VideoArtifactUploadInput): string {
  const episodeId = safeKeySegment(input.episodeId, 'episode id');
  const rendererVersion = safeKeySegment(
    input.rendererVersion,
    'renderer version',
  );
  const manifestHash = safeKeySegment(input.manifestHash, 'manifest hash');
  return `episodes/${episodeId}/localizations/${input.languageCode}/video/${rendererVersion}/${manifestHash}`;
}

function safeKeySegment(value: string, label: string): string {
  if (!/^[a-zA-Z\d][a-zA-Z\d._-]*$/.test(value)) {
    throw new Error(`Invalid video artifact ${label}`);
  }
  return value;
}

function safeSlideFilename(path: string, index: number): string {
  const filename = basename(path);
  if (!/^[a-z\d][a-z\d._-]*\.png$/i.test(filename)) {
    throw new Error(`Invalid slide filename at index ${index}`);
  }
  return filename;
}

async function uploadMp4(input: {
  r2: S3Client;
  Bucket: string;
  Key: string;
  path: string;
  signal?: AbortSignal;
}): Promise<void> {
  input.signal?.throwIfAborted();
  const { Upload } = await import('@aws-sdk/lib-storage');
  input.signal?.throwIfAborted();
  const upload = new Upload({
    client: input.r2,
    params: {
      Bucket: input.Bucket,
      Key: input.Key,
      Body: createReadStream(input.path),
      ContentType: 'video/mp4',
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    },
    partSize: VIDEO_MULTIPART_PART_SIZE,
    queueSize: VIDEO_MULTIPART_QUEUE_SIZE,
    leavePartsOnError: false,
  });
  const abortUpload = () => {
    void upload.abort();
  };
  input.signal?.addEventListener('abort', abortUpload, { once: true });

  try {
    await upload.done();
    input.signal?.throwIfAborted();
  } finally {
    input.signal?.removeEventListener('abort', abortUpload);
  }
}

interface R2ObjectUpload {
  Key: string;
  path: string;
  contentType: string;
}

/**
 * Bounded fan-out for content-addressed artifacts, which are safe to serve with
 * an immutable cache header because their keys carry a hash.
 */
async function putImmutableObjects(
  r2: S3Client,
  Bucket: string,
  signal: AbortSignal | undefined,
  objects: readonly R2ObjectUpload[],
): Promise<void> {
  await mapWithConcurrency(objects, R2_PUT_CONCURRENCY, (object) =>
    putObject(r2, {
      Bucket,
      ...object,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      signal,
    }),
  );
}

async function putObject(
  r2: S3Client,
  input: R2ObjectUpload & {
    Bucket: string;
    cacheControl?: string;
    signal?: AbortSignal;
  },
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    input.signal?.throwIfAborted();
    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: input.Bucket,
          Key: input.Key,
          // A fresh stream per attempt. Reusing the consumed one is why the SDK
          // will not retry a streaming body itself.
          Body: createReadStream(input.path),
          ContentType: input.contentType,
          ...(input.cacheControl === undefined
            ? {}
            : { CacheControl: input.cacheControl }),
        }),
        { abortSignal: input.signal },
      );
      return;
    } catch (error) {
      if (
        attempt >= R2_PUT_MAX_ATTEMPTS ||
        input.signal?.aborted === true ||
        !isRetryableR2Error(error)
      ) {
        throw error;
      }

      const delayMs = r2RetryDelayMs(attempt);
      logPipelineEvent('[r2]', 'put:retry', {
        key: input.Key,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: errorMessage(error),
      });
      await sleep(delayMs);
    }
  }
}

/** 500ms, 1s, ... with up to 50% jitter so a whole batch does not resynchronize. */
function r2RetryDelayMs(attempt: number): number {
  const base = R2_PUT_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.round(base * (1 + Math.random() * 0.5));
}

interface R2ErrorShape {
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  $metadata?: { httpStatusCode?: unknown };
}

/**
 * Transport-level failures are worth another attempt; anything that says the
 * request itself was wrong (credentials, bucket, signature) is not.
 *
 * The SDK wraps the socket error it saw, so the verdict can sit anywhere in the
 * `cause` chain — a bare `Error` whose cause is an `ECONNRESET` is retryable.
 */
function isRetryableR2Error(error: unknown): boolean {
  for (let current = error, depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== 'object') break;
    const candidate = current as R2ErrorShape;
    const verdict = classifyR2Error(candidate);
    if (verdict !== undefined) return verdict;
    current = candidate.cause;
  }

  return false;
}

/** `undefined` means "no opinion" — keep walking the cause chain. */
function classifyR2Error(candidate: R2ErrorShape): boolean | undefined {
  if (candidate.name === 'AbortError') return false;

  const { code, name } = candidate;
  if (typeof code === 'string' && RETRYABLE_R2_ERROR_CODES.has(code)) {
    return true;
  }
  if (typeof name === 'string' && RETRYABLE_R2_ERROR_NAMES.has(name)) {
    return true;
  }

  const status = candidate.$metadata?.httpStatusCode;
  if (typeof status === 'number' && status >= 400) {
    return RETRYABLE_R2_STATUS.has(status) || status >= 500;
  }

  // Node reports an abandoned keep-alive connection with this message and no
  // machine-readable code, and it is one of the two failures seen in production.
  return typeof candidate.message === 'string' &&
    candidate.message.includes('socket hang up')
    ? true
    : undefined;
}
