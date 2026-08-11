import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Downloaded social video is empty.');
  }

  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, outputPath);

  return { path: outputPath, sizeBytes: bytes.length, reused: false };
}
