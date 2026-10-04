import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lines: [] as string[],
  failure: 0,
  calls: 0,
  chains: [] as Record<string, ReturnType<typeof vi.fn>>[],
}));
vi.mock('../../lib/ffmpeg.js', () => ({
  ffmpeg: vi.fn(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of [
      'audioFilters',
      'format',
      'audioCodec',
      'audioBitrate',
      'input',
      'inputFormat',
      'duration',
    ])
      chain[method] = vi.fn(() => chain);
    chain['on'] = vi.fn((event, cb) => {
      handlers[event] = cb;
      return chain;
    });
    chain['save'] = vi.fn(() => {
      mocks.calls += 1;
      const fail = mocks.calls === mocks.failure;
      queueMicrotask(() => {
        for (const line of mocks.lines) handlers['stderr']?.(line);
        if (fail) handlers['error']!(new Error('ffmpeg failed'));
        else handlers['end']!();
      });
      return chain;
    });
    mocks.chains.push(chain);
    return chain;
  }),
}));
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(async () => '/mock/audio-workspace'),
  writeFile: vi.fn(),
  readFile: vi.fn(async () => Buffer.from('encoded')),
  rm: vi.fn(),
}));

import { rm } from 'node:fs/promises';

import {
  createSilentMp3,
  parseSpeechBounds,
  trimMp3Silence,
} from './audio-trim.js';

beforeEach(() => {
  vi.mocked(rm).mockResolvedValue(undefined);
  mocks.lines = [
    'Duration: 00:00:02.00',
    'silence_start: 0',
    'silence_end: 0.5',
    'silence_start: 1.5',
  ];
  mocks.calls = 0;
  mocks.failure = 0;
  mocks.chains = [];
});
afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(rm).mockReset();
});

describe('speech bounds', () => {
  it.each([
    [[], { startS: 0, endS: 2 }],
    [['silence_start: 0', 'silence_end: 0.5'], { startS: 0.44, endS: 2 }],
    [['silence_start: 1.5'], { startS: 0, endS: 1.56 }],
    [['silence_start: 1.5', 'silence_end: 2.01'], { startS: 0, endS: 1.56 }],
    [['silence_start: 0.5', 'silence_end: 0.8'], { startS: 0, endS: 2 }],
    [['silence_end: 0.4'], { startS: 0, endS: 2 }],
    [['silence_start: 0'], null],
    [['silence_start: 0', 'silence_end: 2'], null],
    [['silence_start: 0.04', 'silence_end: 0.05'], { startS: 0, endS: 2 }],
  ])('parses %j', (lines, expected) => {
    expect(parseSpeechBounds(lines, 2)).toEqual(expected);
  });
});
describe('MP3 operations', () => {
  it('detects then trims with ffmpeg 4.1 filters and encodes at 128k', async () => {
    expect(await trimMp3Silence(Buffer.from('source'))).toEqual(
      Buffer.from('encoded'),
    );
    expect(mocks.chains[0]!['audioFilters']).toHaveBeenCalledWith(
      'asetpts=PTS-STARTPTS,silencedetect=noise=-50dB:d=0.08',
    );
    expect(mocks.chains[1]!['audioFilters']).toHaveBeenCalledWith(
      'atrim=start=0.44:end=1.56,asetpts=PTS-STARTPTS',
    );
    expect(mocks.chains[1]!['audioCodec']).toHaveBeenCalledWith('libmp3lame');
    expect(mocks.chains[1]!['audioBitrate']).toHaveBeenCalledWith('128k');
    expect(rm).toHaveBeenCalledWith('/mock/audio-workspace', {
      recursive: true,
      force: true,
    });
  });
  it('returns unchanged audio without reencoding when no edges need trimming', async () => {
    mocks.lines = ['Duration: 00:01:02.00'];
    const source = Buffer.from('source');
    expect(await trimMp3Silence(source)).toBe(source);
    expect(mocks.chains).toHaveLength(1);
  });
  it.each([
    [['Duration: 00:00:02.00', 'silence_start: 0']],
    [['Duration: N/A']],
  ])('fails closed for silent or unmeasurable audio', async (lines) => {
    mocks.lines = lines;
    await expect(trimMp3Silence(Buffer.from('source'))).rejects.toThrow();
    expect(mocks.chains).toHaveLength(1);
  });
  it.each([1, 2])('propagates ffmpeg failure in phase %i', async (phase) => {
    mocks.failure = phase;
    await expect(trimMp3Silence(Buffer.from('source'))).rejects.toThrow(
      'ffmpeg failed',
    );
    expect(rm).toHaveBeenCalled();
  });
  it('creates a mono pause with lavfi and output duration', async () => {
    expect(await createSilentMp3(280)).toEqual(Buffer.from('encoded'));
    expect(mocks.chains[0]!['input']).toHaveBeenCalledWith(
      'anullsrc=channel_layout=mono:sample_rate=44100',
    );
    expect(mocks.chains[0]!['inputFormat']).toHaveBeenCalledWith('lavfi');
    expect(mocks.chains[0]!['duration']).toHaveBeenCalledWith(0.28);
  });
  it('propagates silence generation errors', async () => {
    mocks.failure = 1;
    await expect(createSilentMp3(100)).rejects.toThrow('ffmpeg failed');
  });
  it('ignores cleanup failure', async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error('cleanup'));
    await expect(createSilentMp3(100)).resolves.toEqual(Buffer.from('encoded'));
  });
});
