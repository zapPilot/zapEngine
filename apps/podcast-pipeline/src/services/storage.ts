import { createReadStream } from 'node:fs';
import { basename } from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import type { HlsFile } from './hls.js';

export interface HlsUploadResult {
  hlsUrl: string;
  r2Prefix: string;
}

export interface VideoArtifactUploadInput {
  episodeId: string;
  languageCode: 'zh-Hant';
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
  slideUrls: string[];
}

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const VIDEO_MULTIPART_PART_SIZE = 8 * 1024 * 1024;
const VIDEO_MULTIPART_QUEUE_SIZE = 2;

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
): Promise<HlsUploadResult> {
  const prefix = `episodes/${episodeId}/localizations/${languageCode}/${section}`;
  const r2 = getR2Client();
  const Bucket = getBucket();

  await Promise.all(
    files.map(({ name, data, contentType }) =>
      r2.send(
        new PutObjectCommand({
          Bucket,
          Key: `${prefix}/${name}`,
          Body: data,
          ContentType: contentType,
        }),
      ),
    ),
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

  await Promise.all([
    putFile(
      r2,
      Bucket,
      thumbnailKey,
      input.thumbnailPath,
      'image/png',
      input.signal,
    ),
    putFile(
      r2,
      Bucket,
      manifestKey,
      input.manifestPath,
      'application/json',
      input.signal,
    ),
    putFile(
      r2,
      Bucket,
      captionsKey,
      input.captionsPath,
      'text/x-ssa; charset=utf-8',
      input.signal,
    ),
    ...input.slidePaths.map((slidePath, index) =>
      putFile(
        r2,
        Bucket,
        slideKeys[index]!,
        slidePath,
        'image/png',
        input.signal,
      ),
    ),
  ]);

  const base = getPublicBase();
  return {
    mp4Url: `${base}/${videoKey}`,
    thumbnailUrl: `${base}/${thumbnailKey}`,
    manifestUrl: `${base}/${manifestKey}`,
    captionsAssUrl: `${base}/${captionsKey}`,
    r2Prefix: prefix,
    slideUrls: slideKeys.map((key) => `${base}/${key}`),
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

async function putFile(
  r2: S3Client,
  Bucket: string,
  Key: string,
  path: string,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await r2.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: createReadStream(path),
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }),
    { abortSignal: signal },
  );
}
