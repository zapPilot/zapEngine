import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFfmpeg, mockFfmpegChain } = vi.hoisted(() => {
  const chain = {
    complexFilter: vi.fn().mockReturnThis(),
    input: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === 'end') {
        setTimeout(cb, 0);
      }
      return chain;
    }),
    save: vi.fn().mockReturnThis(),
  };
  const ffmpeg = vi.fn(() => chain) as unknown as typeof vi.fn & {
    setFfmpegPath: ReturnType<typeof vi.fn>;
  };
  ffmpeg.setFfmpegPath = vi.fn().mockReturnThis();
  return {
    mockFfmpeg: ffmpeg,
    mockFfmpegChain: chain,
  };
});

vi.mock('fluent-ffmpeg', () => ({
  default: mockFfmpeg,
}));

vi.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/bin/ffmpeg' }));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid'),
}));

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import { concatMp3Buffers } from './audio-concat.js';

describe('concatMp3Buffers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no buffers are provided', async () => {
    await expect(concatMp3Buffers([])).rejects.toThrow(
      'No MP3 buffers to concatenate',
    );
  });

  it('returns a single buffer unchanged', async () => {
    const buffer = Buffer.from('single');

    await expect(concatMp3Buffers([buffer])).resolves.toBe(buffer);
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(mockFfmpeg).not.toHaveBeenCalled();
  });

  it('concatenates multiple buffers through ffmpeg and cleans up temp files', async () => {
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('combined'));

    const result = await concatMp3Buffers([
      Buffer.from('first'),
      Buffer.from('second'),
    ]);

    expect(result).toEqual(Buffer.from('combined'));
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    expect(mockFfmpegChain.input).toHaveBeenCalledTimes(2);
    expect(mockFfmpegChain.complexFilter).toHaveBeenCalledWith(
      'concat=n=2:v=0:a=1',
    );
    expect(unlinkSync).toHaveBeenCalled();
  });
});
