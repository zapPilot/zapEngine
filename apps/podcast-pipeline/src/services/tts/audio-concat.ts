import { randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { ffmpeg } from '../../lib/ffmpeg.js';

export async function concatMp3Buffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) {
    throw new Error('No MP3 buffers to concatenate');
  }

  if (buffers.length === 1) {
    return buffers[0]!;
  }

  const tempDir = tmpdir();
  const inputFiles: string[] = [];
  const outputFile = `${tempDir}/tts_${randomUUID()}.mp3`;

  try {
    for (const buffer of buffers) {
      const inputFile = `${tempDir}/chunk_${randomUUID()}.mp3`;
      writeFileSync(inputFile, buffer);
      inputFiles.push(inputFile);
    }

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg();
      inputFiles.forEach((file) => {
        command = command.input(file);
      });
      command
        .complexFilter(`concat=n=${inputFiles.length}:v=0:a=1`)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .save(outputFile);
    });

    return readFileSync(outputFile);
  } finally {
    for (const file of inputFiles) {
      try {
        unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(outputFile);
    } catch {
      /* ignore */
    }
  }
}
