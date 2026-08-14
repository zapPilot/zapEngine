import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ffmpeg } from '../lib/ffmpeg.js';

export interface HlsFile {
  name: string;
  path: string;
  contentType: string;
}

export interface HlsResult {
  files: HlsFile[];
  playlistKey: string;
  cleanup: () => Promise<void>;
}

function getContentType(filename: string): string {
  if (filename.endsWith('.m3u8')) {
    return 'application/vnd.apple.mpegurl';
  }
  if (filename.endsWith('.ts')) {
    return 'video/mp2t';
  }
  return 'application/octet-stream';
}

export async function generateHls(mp3Buffer: Buffer): Promise<HlsResult> {
  const tempDir = path.join(tmpdir(), `hls_${randomUUID()}`);
  const inputFile = path.join(tempDir, 'input.mp3');
  const outputName = 'playlist.m3u8';
  const segmentPattern = path.join(tempDir, 'seg%d.ts');
  const cleanup = async (): Promise<void> => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  };

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(inputFile, mp3Buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .audioCodec('aac')
        .audioBitrate(128)
        .format('hls')
        .outputOptions([
          '-hls_time 6',
          '-hls_playlist_type vod',
          `-hls_segment_filename ${segmentPattern}`,
        ])
        .output(path.join(tempDir, outputName))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    const entries = await readdir(tempDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({
        name: entry.name,
        path: path.join(tempDir, entry.name),
        contentType: getContentType(entry.name),
      }));

    if (files.length === 0) {
      throw new Error('No HLS files were generated');
    }

    if (!files.some((file) => file.name === outputName)) {
      throw new Error('Playlist file was not generated');
    }

    return {
      files,
      playlistKey: outputName,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
