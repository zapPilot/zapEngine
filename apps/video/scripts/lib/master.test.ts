import { expect, it, vi } from 'vitest';

import { masterLine } from './master';

const loudness = JSON.stringify({
  input_i: '-18',
  input_tp: '-3',
  input_lra: '1',
  input_thresh: '-28',
  target_offset: '0',
});
it('preserves the exact whole-line mastering filters and encode', async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce(
      'silence_start: 0\nsilence_end: 0.4\nsilence_start: 1.5',
    )
    .mockResolvedValueOnce(loudness)
    .mockResolvedValueOnce('');
  await masterLine('raw', 'target', {
    run,
    duration: vi.fn().mockResolvedValue(2),
  });
  expect(run.mock.calls).toEqual([
    [
      [
        '-i',
        'raw',
        '-af',
        'silencedetect=noise=-45dB:d=0.08',
        '-f',
        'null',
        '-',
      ],
    ],
    [
      [
        '-i',
        'raw',
        '-af',
        'atrim=start=0.340:end=1.560,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
        '-f',
        'null',
        '-',
      ],
    ],
    [
      [
        '-y',
        '-i',
        'raw',
        '-af',
        'atrim=start=0.340:end=1.560,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-18:measured_TP=-3:measured_LRA=1:measured_thresh=-28:offset=0:linear=true:print_format=json',
        '-ar',
        '48000',
        '-ac',
        '1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        'target',
      ],
    ],
  ]);
});
