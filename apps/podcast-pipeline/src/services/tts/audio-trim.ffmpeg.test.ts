import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { ffmpeg } from '../../lib/ffmpeg.js';
import { measureSilences, trimMp3Silence } from './audio-trim.js';
it(
  'trims 50 ms edges with a finer detector on the installed production-family ffmpeg',
  { timeout: 180000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trim-real-'));
    try {
      const file = join(dir, 'source.mp3');
      await new Promise<void>((resolve, reject) =>
        ffmpeg()
          .input('sine=frequency=440:duration=1:sample_rate=44100')
          .inputFormat('lavfi')
          .audioFilters('adelay=50,apad=pad_dur=0.05')
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .on('end', () => resolve())
          .on('error', reject)
          .save(file),
      );
      const raw = await readFile(file);
      const today = await trimMp3Silence(raw, {
        retainSeconds: 0.06,
        minSilenceSeconds: 0.01,
        edgeToleranceSeconds: 0.05,
      });
      const fine = await trimMp3Silence(raw, {
        retainSeconds: 0.015,
        minSilenceSeconds: 0.01,
        edgeToleranceSeconds: 0.05,
      });
      const before = await measureSilences(today);
      const after = await measureSilences(fine);
      expect(before.durationSeconds - after.durationSeconds).toBeGreaterThan(
        0.06,
      );
      expect(before.durationSeconds - after.durationSeconds).toBeLessThan(0.12);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
