import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

interface FfmpegMock {
  setFfmpegPath: Mock;
  audioCodec: Mock;
  audioBitrate: Mock;
  format: Mock;
  outputOptions: Mock;
  output: Mock;
  on: Mock;
  run: Mock;
  input: Mock;
  complexFilter: Mock;
  mockReturnThis: () => FfmpegMock;
  [key: string]: Mock | ((...args: unknown[]) => FfmpegMock);
}

const createFfmpegMock = (): FfmpegMock => ({
  setFfmpegPath: vi.fn().mockReturnThis(),
  audioCodec: vi.fn().mockReturnThis(),
  audioBitrate: vi.fn().mockReturnThis(),
  format: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn().mockImplementation((_event: string, cb: () => void) => {
    queueMicrotask(cb);
    return vi.mocked(createFfmpegMock());
  }),
  run: vi.fn(),
  input: vi.fn().mockReturnThis(),
  complexFilter: vi.fn().mockReturnThis(),
  mockReturnThis(this: FfmpegMock) {
    return this;
  },
});

vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(
    vi.fn().mockImplementation(() => createFfmpegMock()),
    { setFfmpegPath: vi.fn() },
  ),
}));

vi.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/usr/bin/ffmpeg',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.alloc(0)),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isFile: () => true }),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmdirSync: vi.fn(),
  };
});

vi.mock('os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  default: { join: (...args: string[]) => args.join('/') },
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('mock-uuid-123'),
}));

describe('generateHls', { timeout: 10000 }, () => {
  beforeEach(async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(0));
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
    } as unknown as ReturnType<typeof statSync>);
  });

  it('cleans up temp files in finally block on success', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { unlinkSync, rmdirSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
      'seg2.ts',
    ] as unknown as ReturnType<typeof readdirSync>);

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    await generateHls(Buffer.alloc(100));

    expect(vi.mocked(unlinkSync).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(rmdirSync).mock.calls.length).toBeGreaterThan(0);
  });

  it('handles non-standard file extensions in getContentType default case', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { readdirSync, readFileSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
      'extra.json',
      'data.bin',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(Buffer.alloc(0));

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));

    const extraJson = result.files.find((f) => f.name === 'extra.json');
    const dataBin = result.files.find((f) => f.name === 'data.bin');
    expect(extraJson?.contentType).toBe('application/octet-stream');
    expect(dataBin?.contentType).toBe('application/octet-stream');
  });

  it('skips directory entries while collecting generated HLS files', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { readdirSync, statSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'segments',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(statSync).mockImplementation(((filePath: string) => ({
      isFile: () => !filePath.endsWith('/segments'),
    })) as unknown as typeof statSync);

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));

    expect(result.files.map((file) => file.name)).toEqual([
      'playlist.m3u8',
      'seg1.ts',
    ]);
  });

  it('cleans up temp files in finally block when readdirSync throws', async () => {
    const { unlinkSync, rmdirSync, readdirSync } = await import('node:fs');
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('readdir error');
    });

    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    await expect(generateHls(Buffer.alloc(100))).rejects.toThrow();

    expect(vi.mocked(unlinkSync).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(rmdirSync).mock.calls.length).toBeGreaterThan(0);
  });

  it('throws when no files are generated', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    await expect(generateHls(Buffer.alloc(100))).rejects.toThrow(
      'No HLS files were generated',
    );
  });

  it('throws when playlist file is not generated', async () => {
    const { readdirSync } = await import('node:fs');
    vi.mocked(readdirSync).mockReturnValue([
      'seg1.ts',
      'seg2.ts',
    ] as unknown as ReturnType<typeof readdirSync>);

    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    await expect(generateHls(Buffer.alloc(100))).rejects.toThrow(
      'Playlist file was not generated',
    );
  });

  it('handles error when unlinkSync throws in finally block cleanup', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { unlinkSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('unlink failed');
    });

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    expect(result.files.length).toBeGreaterThan(0);
    expect(vi.mocked(unlinkSync).mock.calls.length).toBeGreaterThan(0);
  });

  it('handles error when rmdirSync throws in finally block cleanup', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { rmdirSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(rmdirSync).mockImplementation(() => {
      throw new Error('rmdir failed');
    });

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('swallows error when unlinkSync throws in finally block loop', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { unlinkSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    let unlinkCallCount = 0;
    vi.mocked(unlinkSync).mockImplementation(() => {
      unlinkCallCount++;
      if (unlinkCallCount <= 2) {
        throw new Error('unlink error');
      }
    });

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('swallows error when rmdirSync throws in finally block', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { unlinkSync, rmdirSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    vi.mocked(unlinkSync).mockImplementation(() => {
      // noop - success
    });
    vi.mocked(rmdirSync).mockImplementation(() => {
      throw new Error('rmdir error');
    });

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('swallows outer catch when both unlinkSync and rmdirSync throw', async () => {
    const { default: ffmpeg } = await import('fluent-ffmpeg');
    const { unlinkSync, rmdirSync, readdirSync } = await import('node:fs');

    vi.mocked(readdirSync).mockReturnValue([
      'playlist.m3u8',
      'seg1.ts',
    ] as unknown as ReturnType<typeof readdirSync>);

    const mockFfmpeg = vi.mocked(ffmpeg);
    mockFfmpeg.mockImplementation(
      () => createFfmpegMock() as unknown as ReturnType<typeof ffmpeg>,
    );

    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error('unlink error');
    });
    vi.mocked(rmdirSync).mockImplementation(() => {
      throw new Error('rmdir error');
    });

    const { generateHls } = await import('./hls.js');
    const result = await generateHls(Buffer.alloc(100));
    expect(result.files.length).toBeGreaterThan(0);
  });
});
