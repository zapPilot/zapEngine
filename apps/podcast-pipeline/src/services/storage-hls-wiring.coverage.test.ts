import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const { Readable } = await import('node:stream');
  return {
    createReadStream: vi.fn(() => Readable.from(Buffer.from('fixture'))),
  };
});

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  replaceHls: vi.fn(),
  putInputs: [] as unknown[],
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createReadStream: vi.fn(() => ({ mockedStream: true })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(function (input) {
    mocks.putInputs.push(input);
    return input;
  }),
  S3Client: vi.fn(function () {
    return { send: mocks.send };
  }),
}));

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    const values: Record<string, string> = {
      R2_ENDPOINT: 'https://r2.example.test',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_NAME: 'bucket',
      R2_PUBLIC_BASE_URL: 'https://cdn.example.test/',
    };
    return values[key]!;
  }),
  trimTrailingSlash: (value: string) => {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/') end -= 1;
    return value.slice(0, end);
  },
}));

vi.mock('./storage-hls.js', () => ({ replaceHls: mocks.replaceHls }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.putInputs.length = 0;
  mocks.send.mockResolvedValue({});
  mocks.replaceHls.mockImplementation(async (input) => {
    await input.put({
      Key: `${input.prefix}/segment.ts`,
      path: '/workspace/segment.ts',
      contentType: 'video/mp2t',
      ifMatch: 'etag-1',
    });
    await input.put({
      Key: `${input.prefix}/playlist.m3u8`,
      path: '/workspace/playlist.m3u8',
      contentType: 'application/vnd.apple.mpegurl',
      ifNoneMatch: '*',
      cacheControl: 'no-cache',
    });
  });
});

describe('storage HLS wiring coverage', () => {
  it('uploads a main playlist without a classroom language', async () => {
    const { uploadHlsToR2 } = await import('./storage.js');

    await expect(
      uploadHlsToR2([], 'episode-1', 'zh-Hant', 'main'),
    ).resolves.toEqual({
      hlsUrl:
        'https://cdn.example.test/episodes/episode-1/localizations/zh-Hant/main/playlist.m3u8',
      r2Prefix: 'episodes/episode-1/localizations/zh-Hant/main',
    });

    expect(mocks.replaceHls).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'bucket',
        prefix: 'episodes/episode-1/localizations/zh-Hant/main',
      }),
    );
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.putInputs).toEqual([
      expect.objectContaining({ IfMatch: 'etag-1' }),
      expect.objectContaining({ IfNoneMatch: '*', CacheControl: 'no-cache' }),
    ]);
  });

  it('adds a classroom target language to the prefix', async () => {
    const { uploadHlsToR2 } = await import('./storage.js');

    await expect(
      uploadHlsToR2([], 'episode-2', 'zh-Hant', 'classroom', 'ja'),
    ).resolves.toMatchObject({
      r2Prefix: 'episodes/episode-2/localizations/zh-Hant/classroom/ja',
    });
  });

  it('rejects a classroom target on the main section', async () => {
    const { uploadHlsToR2 } = await import('./storage.js');

    await expect(
      uploadHlsToR2([], 'episode-3', 'zh-Hant', 'main', 'ja'),
    ).rejects.toThrow(
      'classroomTargetLanguageCode is only valid when section is "classroom"',
    );
  });
});
