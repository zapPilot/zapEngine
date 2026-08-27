import type { Dirent } from 'node:fs';

import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

interface FfmpegCommandMock {
  audioCodec: Mock;
  audioBitrate: Mock;
  format: Mock;
  outputOptions: Mock;
  output: Mock;
  on: Mock;
  run: Mock;
}

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

const ffmpegMocks = vi.hoisted(() => ({
  ffmpeg: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsMocks);

vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/var/folders/test-cache'),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid-123'),
}));

vi.mock('../lib/ffmpeg.js', () => ({
  ffmpeg: ffmpegMocks.ffmpeg,
}));

function createFfmpegMock(error?: Error): FfmpegCommandMock {
  const callbacks = new Map<string, (...args: unknown[]) => void>();
  const command = {} as FfmpegCommandMock;
  command.audioCodec = vi.fn(() => command);
  command.audioBitrate = vi.fn(() => command);
  command.format = vi.fn(() => command);
  command.outputOptions = vi.fn(() => command);
  command.output = vi.fn(() => command);
  command.on = vi.fn(
    (event: string, callback: (...args: unknown[]) => void) => {
      callbacks.set(event, callback);
      return command;
    },
  );
  command.run = vi.fn(() => {
    queueMicrotask(() => {
      if (error) {
        callbacks.get('error')?.(error);
      } else {
        callbacks.get('end')?.();
      }
    });
  });
  return command;
}

function fileEntry(name: string): Dirent {
  return {
    name,
    isFile: () => true,
  } as Dirent;
}

function directoryEntry(name: string): Dirent {
  return {
    name,
    isFile: () => false,
  } as Dirent;
}

describe('generateHls', () => {
  beforeEach(() => {
    fsMocks.mkdir.mockReset().mockResolvedValue(undefined);
    fsMocks.readdir
      .mockReset()
      .mockResolvedValue([fileEntry('playlist.m3u8'), fileEntry('seg1.ts')]);
    fsMocks.rm.mockReset().mockResolvedValue(undefined);
    fsMocks.writeFile.mockReset().mockResolvedValue(undefined);
    ffmpegMocks.ffmpeg.mockReset().mockImplementation(() => createFfmpegMock());
  });

  it('returns generated file paths and keeps them until explicit cleanup', async () => {
    fsMocks.readdir.mockResolvedValue([
      fileEntry('playlist.m3u8'),
      fileEntry('seg1.ts'),
      fileEntry('extra.json'),
      directoryEntry('segments'),
    ]);

    const { generateHls } = await import('./hls.js');
    const audio = Buffer.alloc(100);
    const result = await generateHls(audio);

    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      '/var/folders/test-cache/hls_mock-uuid-123/source',
      { recursive: true },
    );
    // The source MP3 must not sit in the directory that gets scanned for
    // upload: when it did, every episode also shipped a full second copy of its
    // audio to R2 as `{prefix}/input.mp3`, which nothing reads.
    expect(fsMocks.writeFile).toHaveBeenCalledWith(
      '/var/folders/test-cache/hls_mock-uuid-123/source/input.mp3',
      audio,
    );
    expect(fsMocks.readdir).toHaveBeenCalledWith(
      '/var/folders/test-cache/hls_mock-uuid-123',
      { withFileTypes: true },
    );
    expect(result.files).toEqual([
      {
        name: 'playlist.m3u8',
        path: '/var/folders/test-cache/hls_mock-uuid-123/playlist.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
      },
      {
        name: 'seg1.ts',
        path: '/var/folders/test-cache/hls_mock-uuid-123/seg1.ts',
        contentType: 'video/mp2t',
      },
      {
        name: 'extra.json',
        path: '/var/folders/test-cache/hls_mock-uuid-123/extra.json',
        contentType: 'application/octet-stream',
      },
    ]);
    expect(result.playlistKey).toBe('playlist.m3u8');
    expect(fsMocks.rm).not.toHaveBeenCalled();

    await result.cleanup();

    expect(fsMocks.rm).toHaveBeenCalledWith(
      '/var/folders/test-cache/hls_mock-uuid-123',
      {
        recursive: true,
        force: true,
      },
    );
  });

  it('cleans up and throws when no files are generated', async () => {
    fsMocks.readdir.mockResolvedValue([]);

    const { generateHls } = await import('./hls.js');

    await expect(generateHls(Buffer.alloc(100))).rejects.toThrow(
      'No HLS files were generated',
    );
    expect(fsMocks.rm).toHaveBeenCalledTimes(1);
  });

  it('cleans up and throws when the playlist is missing', async () => {
    fsMocks.readdir.mockResolvedValue([
      fileEntry('seg1.ts'),
      fileEntry('seg2.ts'),
    ]);

    const { generateHls } = await import('./hls.js');

    await expect(generateHls(Buffer.alloc(100))).rejects.toThrow(
      'Playlist file was not generated',
    );
    expect(fsMocks.rm).toHaveBeenCalledTimes(1);
  });

  it('cleans up when reading generated entries fails', async () => {
    const error = new Error('readdir error');
    fsMocks.readdir.mockRejectedValue(error);

    const { generateHls } = await import('./hls.js');

    await expect(generateHls(Buffer.alloc(100))).rejects.toBe(error);
    expect(fsMocks.rm).toHaveBeenCalledTimes(1);
  });

  it('cleans up when ffmpeg fails', async () => {
    const error = new Error('ffmpeg error');
    ffmpegMocks.ffmpeg.mockImplementationOnce(() => createFfmpegMock(error));

    const { generateHls } = await import('./hls.js');

    await expect(generateHls(Buffer.alloc(100))).rejects.toBe(error);
    expect(fsMocks.rm).toHaveBeenCalledTimes(1);
    expect(fsMocks.readdir).not.toHaveBeenCalled();
  });

  it('preserves a successful result when cleanup itself fails', async () => {
    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    fsMocks.rm.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(result.cleanup()).resolves.toBeUndefined();
  });
});
