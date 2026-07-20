import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => {
  const { Readable } = await import('node:stream');
  return {
    createReadStream: vi.fn(() => Readable.from(Buffer.from('fixture'))),
  };
});

vi.mock('../lib/env.js', () => ({
  getRequiredEnv: vi.fn((key: string) => {
    const env: Record<string, string> = {
      R2_ENDPOINT: 'https://abc.r2.dev',
      R2_ACCESS_KEY_ID: 'key-id',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      R2_BUCKET_NAME: 'test-bucket',
      R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    };
    if (key in env) return env[key]!;
    throw new Error(`Unknown env: ${key}`);
  }),
  trimTrailingSlash: vi.fn((v: string) => {
    let end = v.length;
    while (end > 0 && v[end - 1] === '/') {
      end -= 1;
    }
    return v.slice(0, end);
  }),
}));

const { mockSend, mockUploadAbort, mockUploadDone, mockUploadConstructor } =
  vi.hoisted(() => ({
    mockSend: vi.fn().mockResolvedValue({}),
    mockUploadAbort: vi.fn().mockResolvedValue(undefined),
    mockUploadDone: vi.fn().mockResolvedValue({}),
    mockUploadConstructor: vi.fn(),
  }));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(),
  S3Client: vi.fn().mockImplementation(function () {
    return {
      send: mockSend,
    };
  }),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function (options) {
    mockUploadConstructor(options);
    return {
      abort: mockUploadAbort,
      done: mockUploadDone,
    };
  }),
}));

import type { HlsFile } from './hls.js';
import { uploadHlsToR2, uploadVideoArtifactsToR2 } from './storage.js';

beforeEach(() => {
  mockSend.mockClear();
  mockUploadAbort.mockClear();
  mockUploadDone.mockClear();
  mockUploadConstructor.mockClear();
});

describe('uploadHlsToR2', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads files with correct URL format', async () => {
    const files: HlsFile[] = [
      {
        name: 'playlist.m3u8',
        data: Buffer.alloc(50),
        contentType: 'application/vnd.apple.mpegurl',
      },
    ];

    const result = await uploadHlsToR2(files, 'test-id', 'zh-Hant', 'main');

    expect(result).toEqual({
      hlsUrl:
        'https://cdn.example.com/episodes/test-id/localizations/zh-Hant/main/playlist.m3u8',
      r2Prefix: 'episodes/test-id/localizations/zh-Hant/main',
    });
    expect(mockSend).toHaveBeenCalled();
  });
});

describe('uploadVideoArtifactsToR2', () => {
  it('uses bounded multipart upload for MP4 and immutable keys for sidecars', async () => {
    const result = await uploadVideoArtifactsToR2({
      episodeId: '00000000-0000-4000-8000-000000000001',
      languageCode: 'zh-Hant',
      rendererVersion: 'satori-resvg-v1',
      manifestHash: 'abc123',
      videoPath: '/render/video.mp4',
      thumbnailPath: '/render/thumbnail.png',
      manifestPath: '/render/storyboard.json',
      captionsPath: '/render/captions.ass',
      slidePaths: ['/render/slide-01.png', '/render/slide-02.png'],
    });

    const prefix =
      'episodes/00000000-0000-4000-8000-000000000001/localizations/zh-Hant/video/satori-resvg-v1/abc123';
    expect(result).toEqual({
      mp4Url: `https://cdn.example.com/${prefix}/video.mp4`,
      thumbnailUrl: `https://cdn.example.com/${prefix}/thumbnail.png`,
      manifestUrl: `https://cdn.example.com/${prefix}/manifest.json`,
      captionsAssUrl: `https://cdn.example.com/${prefix}/captions.ass`,
      r2Prefix: prefix,
      slideUrls: [
        `https://cdn.example.com/${prefix}/slides/slide-01.png`,
        `https://cdn.example.com/${prefix}/slides/slide-02.png`,
      ],
    });
    expect(mockUploadConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false,
        params: expect.objectContaining({
          Bucket: 'test-bucket',
          Key: `${prefix}/video.mp4`,
          ContentType: 'video/mp4',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      }),
    );
    expect(mockUploadDone).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(5);
  });

  it('aborts an in-flight multipart upload with the caller signal', async () => {
    const controller = new AbortController();
    let finishUpload!: () => void;
    mockUploadDone.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );

    const pending = uploadVideoArtifactsToR2({
      episodeId: 'episode-1',
      languageCode: 'zh-Hant',
      rendererVersion: 'renderer-v1',
      manifestHash: 'hash-1',
      videoPath: '/render/video.mp4',
      thumbnailPath: '/render/thumbnail.png',
      manifestPath: '/render/manifest.json',
      captionsPath: '/render/captions.ass',
      slidePaths: [],
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(mockUploadDone).toHaveBeenCalledTimes(1));
    controller.abort(new Error('shutdown'));
    await vi.waitFor(() => expect(mockUploadAbort).toHaveBeenCalledTimes(1));
    finishUpload();
    await expect(pending).rejects.toThrow('shutdown');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects unsafe immutable key segments before uploading', async () => {
    await expect(
      uploadVideoArtifactsToR2({
        episodeId: '../episode',
        languageCode: 'zh-Hant',
        rendererVersion: 'renderer-v1',
        manifestHash: 'hash',
        videoPath: '/render/video.mp4',
        thumbnailPath: '/render/thumbnail.png',
        manifestPath: '/render/manifest.json',
        captionsPath: '/render/captions.ass',
        slidePaths: [],
      }),
    ).rejects.toThrow('Invalid video artifact episode id');
    expect(mockUploadDone).not.toHaveBeenCalled();
  });

  it('rejects slide paths with unsafe filenames', async () => {
    await expect(
      uploadVideoArtifactsToR2({
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        rendererVersion: 'renderer-v1',
        manifestHash: 'hash',
        videoPath: '/render/video.mp4',
        thumbnailPath: '/render/thumbnail.png',
        manifestPath: '/render/manifest.json',
        captionsPath: '/render/captions.ass',
        slidePaths: ['/render/unsafe name with space.png'],
      }),
    ).rejects.toThrow('Invalid slide filename at index 0');
    expect(mockUploadDone).not.toHaveBeenCalled();
  });
});
