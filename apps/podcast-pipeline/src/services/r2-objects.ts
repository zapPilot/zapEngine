import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { getRequiredEnv } from '../lib/env.js';

export interface StoredObject {
  key: string;
  modified: Date | undefined;
  size: number;
}

export async function listR2Objects(
  r2: S3Client,
  bucket: string,
  prefix: string,
): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let token: string | undefined;
  const tokens = new Set<string>();
  do {
    const page = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key?.startsWith(prefix))
        throw new Error('Invalid R2 listing');
      objects.push({
        key: object.Key,
        modified: object.LastModified,
        size: object.Size ?? 0,
      });
    }
    if (!page.IsTruncated) break;
    token = page.NextContinuationToken;
    if (!token || tokens.has(token)) throw new Error('Incomplete R2 listing');
    tokens.add(token);
  } while (token);
  return objects;
}

export async function deleteR2Objects(
  r2: S3Client,
  bucket: string,
  keys: readonly string[],
): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    const result = await r2.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.slice(offset, offset + 1000).map((Key) => ({ Key })),
          Quiet: false,
        },
      }),
    );
    if (result.Errors?.length)
      throw new Error(`R2 deletion failed: ${JSON.stringify(result.Errors)}`);
    const deleted = new Set(result.Deleted?.map((item) => item.Key));
    if (keys.slice(offset, offset + 1000).some((key) => !deleted.has(key)))
      throw new Error('R2 did not confirm every deletion');
  }
}

export function createR2ClientFromEnv(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

export async function downloadR2Object(
  r2: S3Client,
  bucket: string,
  key: string,
  path: string,
): Promise<void> {
  const result = await r2.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!(result.Body instanceof Readable))
    throw new Error('Missing R2 response stream');
  await pipeline(result.Body, createWriteStream(path, { flags: 'wx' }));
}
