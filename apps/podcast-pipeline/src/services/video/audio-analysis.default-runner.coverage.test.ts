import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runProcess: vi.fn(),
  resolveVideoFfmpegPath: vi.fn(() => '/mock/ffmpeg'),
}));

vi.mock('./ffmpeg-video.js', () => ({
  runProcess: mocks.runProcess,
  resolveVideoFfmpegPath: mocks.resolveVideoFfmpegPath,
}));

import {
  detectAudioSilences,
  downloadNarrationAudio,
  probeAudioDurationMs,
} from './audio-analysis.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('audio analysis default process runner coverage', () => {
  it('uses the default runner for narration download', async () => {
    mocks.runProcess.mockResolvedValue({ stdout: '', stderr: '' });

    await downloadNarrationAudio('/local/audio.m4a', '/work/audio.m4a', {
      ffmpegPath: '/custom/ffmpeg',
    });

    expect(mocks.runProcess).toHaveBeenCalledWith('/custom/ffmpeg', [
      '-y',
      '-i',
      '/local/audio.m4a',
      '-map',
      '0:a:0',
      '-c',
      'copy',
      '/work/audio.m4a',
    ]);
  });

  it('uses the default runner for duration probing', async () => {
    mocks.runProcess.mockResolvedValue({
      stdout: JSON.stringify({ format: { duration: 1 } }),
      stderr: '',
    });

    await expect(
      probeAudioDurationMs('/local/audio.m4a', {
        ffprobePath: '/mock/ffprobe',
      }),
    ).resolves.toBe(1_000);

    expect(mocks.runProcess).toHaveBeenCalledWith(
      '/mock/ffprobe',
      expect.any(Array),
    );
  });

  it('uses the default runner for silence detection', async () => {
    mocks.runProcess.mockResolvedValue({
      stdout: '',
      stderr: 'silence_start: 1\nsilence_end: 2',
    });

    await expect(
      detectAudioSilences('/local/audio.m4a', { ffmpegPath: '/mock/ffmpeg' }),
    ).resolves.toEqual([{ startMs: 1_000, endMs: 2_000 }]);

    expect(mocks.runProcess).toHaveBeenCalledWith(
      '/mock/ffmpeg',
      expect.any(Array),
    );
  });
});
