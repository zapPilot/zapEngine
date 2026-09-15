import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import { mapWithConcurrency } from '../lib/concurrency.js';
import { errorMessage } from '../lib/errorMessage.js';
import type { HlsFile } from './hls.js';
import { logPipelineEvent } from './ingest/step.js';
import { deleteR2Objects, listR2Objects } from './r2-objects.js';

interface HlsPut {
  Key: string;
  path: string;
  contentType: string;
  cacheControl?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
}

/** Stage disjoint segments, then compare-and-swap the existing public playlist. */
export async function replaceHls(input: {
  r2: S3Client;
  bucket: string;
  prefix: string;
  files: readonly HlsFile[];
  put: (object: HlsPut) => Promise<void>;
}): Promise<void> {
  const { r2, bucket, prefix, files, put } = input;
  const playlist = files.find((file) => file.name === 'playlist.m3u8');
  if (!playlist) throw new Error('HLS playlist is required');
  const names = new Set(files.map((file) => file.name));
  if (
    names.size !== files.length ||
    files.some(
      (file) => !/^(playlist\.m3u8|[a-zA-Z0-9_-]+\.ts)$/.test(file.name),
    )
  ) {
    throw new Error('Invalid or duplicate HLS filename');
  }
  const text = await readFile(playlist.path, 'utf8');
  if (
    !text.startsWith('#EXTM3U') ||
    !text.includes('#EXT-X-ENDLIST') ||
    text.includes('URI=')
  ) {
    throw new Error('Only self-contained MPEG-TS VOD playlists are supported');
  }
  const generation = randomUUID();
  const replacements = new Map(
    files
      .filter((file) => file !== playlist)
      .map((file) => [file.name, `seg-${generation}-${file.name}`]),
  );
  const referenced = new Set<string>();
  const rewritten = text
    .split(/\r?\n/)
    .map((line) => {
      if (!line || line.startsWith('#')) return line;
      const replacement = replacements.get(line);
      if (!replacement) throw new Error(`Missing HLS segment: ${line}`);
      referenced.add(line);
      return replacement;
    })
    .join('\n');
  if (!referenced.size || referenced.size !== replacements.size)
    throw new Error('HLS segment set does not match playlist');
  const playlistKey = `${prefix}/playlist.m3u8`;
  let etag: string | undefined;
  try {
    const previous = await r2.send(
      new HeadObjectCommand({ Bucket: bucket, Key: playlistKey }),
    );
    if (!previous.ETag) throw new Error('Previous HLS playlist has no ETag');
    etag = previous.ETag;
  } catch (error) {
    if (
      (error as { name?: string }).name !== 'NotFound' &&
      (error as { name?: string }).name !== 'NoSuchKey'
    )
      throw error;
  }
  // Snapshot before staging: never sweep a generation uploaded after this one.
  const previousObjects = await listR2Objects(r2, bucket, `${prefix}/`);
  const directory = await mkdtemp(join(tmpdir(), 'r2-hls-'));
  try {
    await mapWithConcurrency(
      files.filter((file) => file !== playlist),
      4,
      (file) =>
        put({
          Key: `${prefix}/${replacements.get(file.name)!}`,
          path: file.path,
          contentType: file.contentType,
        }),
    );
    const playlistPath = join(directory, 'playlist.m3u8');
    await writeFile(playlistPath, rewritten);
    await put({
      Key: playlistKey,
      path: playlistPath,
      contentType: playlist.contentType,
      cacheControl: 'no-cache, max-age=0, must-revalidate',
      ...(etag ? { ifMatch: etag } : { ifNoneMatch: '*' }),
    });
    // Classroom's target-language children are independent HLS publications.
    const stale = previousObjects.filter((object) => {
      const name = object.key.slice(prefix.length + 1);
      return /^(?:[a-zA-Z0-9_-]+\.ts|input\.mp3)$/.test(name);
    });
    try {
      await deleteR2Objects(
        r2,
        bucket,
        stale.map((object) => object.key),
      );
      logPipelineEvent('[r2]', 'hls:cleanup', {
        prefix,
        deletedObjects: stale.length,
      });
    } catch (error) {
      // Publication already succeeded. A later replacement retries this sweep.
      logPipelineEvent('[r2]', 'hls:cleanup-failed', {
        prefix,
        error: errorMessage(error),
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
