import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import type { HlsFile } from './hls.js';

export interface HlsUploadResult {
  hlsUrl: string;
  r2Prefix: string;
}

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
