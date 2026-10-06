import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { loudnormFilter, parseLoudnorm, silenceIntervals } from './audio';
import { masterLine } from './master';
import { ffmpeg, mediaDuration } from './media';
import { assembleLine } from './speech-assemble';

function wave(): Buffer {
  const samples = 48000;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(96000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 2400; i < 45600; i++)
    bytes.writeInt16LE(
      Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / 48000)),
      44 + i * 2,
    );
  return bytes;
}
it(
  'measures tagged and untagged MP3 seams after exact PCM decoding and whole-line mastering',
  { timeout: 300000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'seam-real-'));
    try {
      const wav = path.join(dir, 'source.wav');
      await writeFile(wav, wave());
      const tagged = path.join(dir, 'tagged.mp3');
      const untagged = path.join(dir, 'untagged.mp3');
      await ffmpeg([
        '-y',
        '-i',
        wav,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        tagged,
      ]);
      await ffmpeg([
        '-y',
        '-i',
        wav,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-write_xing',
        '0',
        untagged,
      ]);
      const parts = [
        { kind: 'audio' as const, file: tagged },
        { kind: 'pause' as const, ms: 550 },
        { kind: 'audio' as const, file: untagged },
      ];
      const fine = path.join(dir, 'fine.mp3');
      const naive = path.join(dir, 'naive.mp3');
      await assembleLine(parts, dir, fine, 0.015);
      await assembleLine(parts, dir, naive, 0.06);
      const fineDuration = await mediaDuration(fine);
      const naiveDuration = await mediaDuration(naive);
      expect(naiveDuration - fineDuration).toBeGreaterThan(0.06);
      expect(naiveDuration - fineDuration).toBeLessThan(0.12);
      const stderr = await ffmpeg([
        '-i',
        fine,
        '-af',
        `silencedetect=noise=-45dB:d=0.01,${loudnormFilter()}`,
        '-f',
        'null',
        '-',
      ]);
      const silences = silenceIntervals(stderr, fineDuration);
      const inner = silences.filter(
        (s) => s.start > 0.1 && s.end < fineDuration - 0.1,
      );
      expect(inner).toHaveLength(1);
      expect(inner[0]!.end - inner[0]!.start).toBeCloseTo(0.58, 2);
      expect(parseLoudnorm(stderr).i).toBeCloseTo(-16, 0);
      // The existing master keeps outer room tone; the 50 ms source edge is not cut.
      expect(silences[0]!.end).toBeGreaterThan(0.03);
      expect(silences[0]!.end).toBeLessThan(0.09);
      const master = path.join(dir, 'master.mp3');
      await masterLine(wav, master);
      expect(await mediaDuration(master)).toBeGreaterThan(0.98);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
