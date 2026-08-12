import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

const SOCIAL_TEMP_DIR = join(tmpdir(), 'zap-pilot-social');

export interface PreparedVideo {
  path: string;
  sizeBytes: number;
  reused: boolean;
}

export async function prepareSocialVideo(input: {
  episodeId: string;
  language: 'zh';
  url: string;
}): Promise<PreparedVideo> {
  await mkdir(SOCIAL_TEMP_DIR, { recursive: true });
  const safeEpisodeId = input.episodeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = join(
    SOCIAL_TEMP_DIR,
    `episode-${safeEpisodeId}-${input.language}.mp4`,
  );

  const existing = await stat(outputPath).catch(() => null);
  if (existing?.isFile() && existing.size > 0) {
    return { path: outputPath, sizeBytes: existing.size, reused: true };
  }

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
  try {
    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream),
      createWriteStream(temporaryPath),
    );
    const downloaded = await stat(temporaryPath);
    if (downloaded.size === 0) {
      throw new Error('Downloaded social video is empty.');
    }
    await rename(temporaryPath, outputPath);

    return { path: outputPath, sizeBytes: downloaded.size, reused: false };
  } catch (error) {
    await unlink(temporaryPath).catch(() => null);
    throw error;
  }
}
