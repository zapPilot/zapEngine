import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ffmpeg } from '../lib/ffmpeg.js';

export interface HlsFile {
  name: string;
  data: Buffer;
  contentType: string;
}

export interface HlsResult {
  files: HlsFile[];
  playlistKey: string;
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
  mkdirSync(tempDir, { recursive: true });
  const inputFile = path.join(tempDir, 'input.mp3');
  const outputName = 'playlist.m3u8';
  const segmentPattern = path.join(tempDir, 'seg%d.ts');
  let generatedEntries: string[] | null = null;

  writeFileSync(inputFile, mp3Buffer);

  try {
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

    const entries = readdirSync(tempDir);
    generatedEntries = entries;
    const files: HlsFile[] = [];
    let playlistGenerated = false;

    for (const entry of entries) {
      const filePath = path.join(tempDir, entry);
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;

      if (entry === outputName) {
        playlistGenerated = true;
      }

      const data = readFileSync(filePath);
      files.push({
        name: entry,
        data,
        contentType: getContentType(entry),
      });
    }

    if (files.length === 0) {
      throw new Error('No HLS files were generated');
    }

    if (!playlistGenerated) {
      throw new Error('Playlist file was not generated');
    }

    return {
      files,
      playlistKey: outputName,
    };
  } finally {
    try {
      const entries = generatedEntries ?? readdirSync(tempDir);
      for (const entry of entries) {
        try {
          unlinkSync(path.join(tempDir, entry));
        } catch {
          /* ignore */
        }
      }
      try {
        rmdirSync(tempDir);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore cleanup errors */
    }
  }
}
