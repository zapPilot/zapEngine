import { createReadStream } from 'node:fs';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { mockSleep, mockLogPipelineEvent } = vi.hoisted(() => ({
  mockSleep: vi.fn().mockResolvedValue(undefined),
  mockLogPipelineEvent: vi.fn(),
}));

// Retries are instant here so the backoff schedule can be asserted from the
// recorded delays instead of waited out.
vi.mock('../lib/sleep.js', () => ({ sleep: mockSleep }));
vi.mock('./ingest/step.js', () => ({
  logPipelineEvent: mockLogPipelineEvent,
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
import {
  uploadEpisodeVisualAssetsToR2,
  uploadEpisodeVisualCheckpointImageToR2,
  uploadHlsToR2,
  uploadVideoArtifactsToR2,
} from './storage.js';

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({});
  mockUploadAbort.mockReset().mockResolvedValue(undefined);
  mockUploadDone.mockReset().mockResolvedValue({});
  mockUploadConstructor.mockClear();
  mockSleep.mockReset().mockResolvedValue(undefined);
  mockLogPipelineEvent.mockReset();
  vi.mocked(createReadStream).mockClear();
  vi.mocked(PutObjectCommand).mockClear();
});

describe('uploadHlsToR2', () => {
  it('streams files from disk with the correct URL format', async () => {
    const files: HlsFile[] = [
      {
        name: 'playlist.m3u8',
        path: '/render/hls/playlist.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
      },
    ];

    const result = await uploadHlsToR2(files, 'test-id', 'zh-Hant', 'main');

    expect(result).toEqual({
      hlsUrl:
        'https://cdn.example.com/episodes/test-id/localizations/zh-Hant/main/playlist.m3u8',
      r2Prefix: 'episodes/test-id/localizations/zh-Hant/main',
    });
    expect(createReadStream).toHaveBeenCalledWith('/render/hls/playlist.m3u8');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'episodes/test-id/localizations/zh-Hant/main/playlist.m3u8',
      Body: vi.mocked(createReadStream).mock.results[0]?.value,
      ContentType: 'application/vnd.apple.mpegurl',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('waits for every in-flight stream upload before rejecting', async () => {
    const uploadError = new Error('playlist upload failed');
    let finishSegmentUpload!: () => void;
    mockSend.mockRejectedValueOnce(uploadError).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSegmentUpload = () => resolve({});
        }),
    );

    const pending = uploadHlsToR2(
      [
        {
          name: 'playlist.m3u8',
          path: '/render/hls/playlist.m3u8',
          contentType: 'application/vnd.apple.mpegurl',
        },
        {
          name: 'seg1.ts',
          path: '/render/hls/seg1.ts',
          contentType: 'video/mp2t',
        },
      ],
      'test-id',
      'zh-Hant',
      'classroom',
    );
    let settled = false;
    void pending.then(
      () => {
        settled = true;
        return undefined;
      },
      () => {
        settled = true;
        return undefined;
      },
    );

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(settled).toBe(false);

    finishSegmentUpload();

    await expect(pending).rejects.toBe(uploadError);
    expect(createReadStream).toHaveBeenCalledWith('/render/hls/playlist.m3u8');
    expect(createReadStream).toHaveBeenCalledWith('/render/hls/seg1.ts');
  });

  it('nests a per-target-language prefix under the classroom section', async () => {
    const files: HlsFile[] = [
      {
        name: 'playlist.m3u8',
        path: '/render/hls/playlist.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
      },
    ];

    const result = await uploadHlsToR2(
      files,
      'test-id',
      'zh-Hant',
      'classroom',
      'ja',
    );

    expect(result).toEqual({
      hlsUrl:
        'https://cdn.example.com/episodes/test-id/localizations/zh-Hant/classroom/ja/playlist.m3u8',
      r2Prefix: 'episodes/test-id/localizations/zh-Hant/classroom/ja',
    });
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: 'episodes/test-id/localizations/zh-Hant/classroom/ja/playlist.m3u8',
      }),
    );
  });

  it('rejects a target language code outside the classroom section', async () => {
    const files: HlsFile[] = [
      {
        name: 'playlist.m3u8',
        path: '/render/hls/playlist.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
      },
    ];

    await expect(
      uploadHlsToR2(files, 'test-id', 'zh-Hant', 'main', 'ja'),
    ).rejects.toThrow(
      'classroomTargetLanguageCode is only valid when section is "classroom"',
    );
    expect(mockSend).not.toHaveBeenCalled();
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

describe('uploadEpisodeVisualAssetsToR2', () => {
  it('uploads one immutable shared image per scene and its visual manifest', async () => {
    const result = await uploadEpisodeVisualAssetsToR2({
      episodeId: '00000000-0000-4000-8000-000000000001',
      visualVersion: 'image-slideshow-v1',
      visualHash: 'visual-hash',
      manifestPath: '/render/visual-manifest.json',
      images: [
        {
          sceneId: 'scene-01',
          path: '/render/scene-01.image',
          contentType: 'image/jpeg',
        },
        {
          sceneId: 'scene-02',
          path: '/render/scene-02.image',
          contentType: 'image/webp',
        },
      ],
    });
    const prefix =
      'episodes/00000000-0000-4000-8000-000000000001/visuals/image-slideshow-v1/visual-hash';

    expect(result).toEqual({
      manifestUrl: `https://cdn.example.com/${prefix}/visual-manifest.json`,
      imageUrls: {
        'scene-01': `https://cdn.example.com/${prefix}/images/scene-01.jpg`,
        'scene-02': `https://cdn.example.com/${prefix}/images/scene-02.webp`,
      },
      r2Prefix: prefix,
    });
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('rejects duplicate or unsafe visual scene ids before upload', async () => {
    await expect(
      uploadEpisodeVisualAssetsToR2({
        episodeId: 'episode-1',
        visualVersion: 'image-slideshow-v1',
        visualHash: 'visual-hash',
        manifestPath: '/render/visual-manifest.json',
        images: [
          {
            sceneId: '../scene',
            path: '/render/scene.image',
            contentType: 'image/png',
          },
        ],
      }),
    ).rejects.toThrow('Invalid video artifact visual scene id');

    await expect(
      uploadEpisodeVisualAssetsToR2({
        episodeId: 'episode-1',
        visualVersion: 'image-slideshow-v1',
        visualHash: 'visual-hash',
        manifestPath: '/render/visual-manifest.json',
        images: [
          {
            sceneId: 'scene-01',
            path: '/render/scene-a.image',
            contentType: 'image/png',
          },
          {
            sceneId: 'scene-01',
            path: '/render/scene-b.image',
            contentType: 'image/png',
          },
        ],
      }),
    ).rejects.toThrow('Duplicate visual scene id: scene-01');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('R2 upload retries', () => {
  const playlist: HlsFile[] = [
    {
      name: 'playlist.m3u8',
      path: '/render/hls/playlist.m3u8',
      contentType: 'application/vnd.apple.mpegurl',
    },
  ];

  function transportError(
    message: string,
    extra: Record<string, unknown> = {},
  ): Error {
    return Object.assign(new Error(message), extra);
  }

  const upload = () => uploadHlsToR2(playlist, 'test-id', 'zh-Hant', 'main');

  it('reopens the stream on a retry instead of replaying a consumed one', async () => {
    // The AWS SDK refuses to retry a Readable body at all, so the second
    // attempt has to build its own stream.
    mockSend.mockRejectedValueOnce(
      transportError('write EPIPE', { code: 'EPIPE' }),
    );

    await expect(upload()).resolves.toMatchObject({
      r2Prefix: expect.any(String),
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(
      vi
        .mocked(createReadStream)
        .mock.calls.filter(([path]) => path === '/render/hls/playlist.m3u8'),
    ).toHaveLength(2);
  });

  it('retries a socket hang up, which carries no error code', async () => {
    mockSend.mockRejectedValueOnce(transportError('socket hang up'));

    await expect(upload()).resolves.toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['503', 503],
    ['429', 429],
    ['408', 408],
  ])('retries an HTTP %s response', async (_label, httpStatusCode) => {
    mockSend.mockRejectedValueOnce(
      transportError('r2 unavailable', { $metadata: { httpStatusCode } }),
    );

    await expect(upload()).resolves.toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      '403 AccessDenied',
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    ],
    [
      'bad credentials',
      { name: 'InvalidAccessKeyId', $metadata: { httpStatusCode: 403 } },
    ],
    [
      '404 NoSuchBucket',
      { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } },
    ],
  ])('does not retry %s', async (_label, extra) => {
    const error = transportError('not retryable', extra);
    mockSend.mockRejectedValue(error);

    await expect(upload()).rejects.toBe(error);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSleep).not.toHaveBeenCalled();
  });

  it('retries a transient failure nested under `cause`', async () => {
    mockSend.mockRejectedValueOnce(
      new Error('wrapped', {
        cause: transportError('read ECONNRESET', { code: 'ECONNRESET' }),
      }),
    );

    await expect(upload()).resolves.toBeDefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts and preserves the original error', async () => {
    const error = transportError('write EPIPE', {
      code: 'EPIPE',
      $metadata: { httpStatusCode: 500, requestId: 'req-1' },
    });
    mockSend.mockRejectedValue(error);

    await expect(upload()).rejects.toBe(error);
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('backs off exponentially with jitter and logs each retry', async () => {
    mockSend.mockRejectedValue(
      transportError('write EPIPE', { code: 'EPIPE' }),
    );

    await expect(upload()).rejects.toThrow('write EPIPE');

    const delays = mockSleep.mock.calls.map(([ms]) => ms as number);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(500);
    expect(delays[0]).toBeLessThanOrEqual(750);
    expect(delays[1]).toBeGreaterThanOrEqual(1000);
    expect(delays[1]).toBeLessThanOrEqual(1500);

    expect(mockLogPipelineEvent).toHaveBeenCalledTimes(2);
    expect(mockLogPipelineEvent).toHaveBeenLastCalledWith(
      '[r2]',
      'put:retry',
      expect.objectContaining({
        key: 'episodes/test-id/localizations/zh-Hant/main/playlist.m3u8',
        attempt: 2,
        nextAttempt: 3,
        error: 'write EPIPE',
      }),
    );
  });

  it('does not retry once the caller signal is aborted', async () => {
    const controller = new AbortController();
    mockSend.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(transportError('write EPIPE', { code: 'EPIPE' }));
    });

    await expect(
      uploadEpisodeVisualAssetsToR2({
        episodeId: 'ep-1',
        visualVersion: 'v5',
        visualHash: 'hash1',
        manifestPath: '/render/visual-manifest.json',
        images: [],
        signal: controller.signal,
      }),
    ).rejects.toThrow('write EPIPE');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('R2 upload concurrency', () => {
  it('keeps at most four HLS segment uploads in flight', async () => {
    let active = 0;
    let peak = 0;
    mockSend.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return {};
    });

    const files: HlsFile[] = Array.from({ length: 10 }, (_unused, index) => ({
      name: `seg${index}.ts`,
      path: `/render/hls/seg${index}.ts`,
      contentType: 'video/mp2t',
    }));

    await uploadHlsToR2(files, 'test-id', 'zh-Hant', 'main');

    expect(mockSend).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
  });

  it('bounds the visual asset fan-out too', async () => {
    let active = 0;
    let peak = 0;
    mockSend.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return {};
    });

    await uploadEpisodeVisualAssetsToR2({
      episodeId: 'ep-1',
      visualVersion: 'v5',
      visualHash: 'hash1',
      manifestPath: '/render/visual-manifest.json',
      images: Array.from({ length: 12 }, (_unused, index) => ({
        sceneId: `scene-${index}`,
        path: `/render/scene-${index}.jpg`,
        contentType: 'image/jpeg' as const,
      })),
    });

    expect(peak).toBe(4);
  });
});

describe('R2 cache headers', () => {
  it('leaves HLS objects cacheable-but-revalidatable', async () => {
    // The HLS prefix carries no content hash, so a resumed ingest rewrites the
    // same keys. An immutable header here would pin the CDN to stale audio.
    await uploadHlsToR2(
      [
        {
          name: 'playlist.m3u8',
          path: '/render/hls/playlist.m3u8',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      'test-id',
      'zh-Hant',
      'main',
    );

    expect(vi.mocked(PutObjectCommand).mock.calls[0]![0]).not.toHaveProperty(
      'CacheControl',
    );
  });

  it('keeps content-addressed artifacts immutable', async () => {
    await uploadEpisodeVisualAssetsToR2({
      episodeId: 'ep-1',
      visualVersion: 'v5',
      visualHash: 'hash1',
      manifestPath: '/render/visual-manifest.json',
      images: [
        {
          sceneId: 'scene-01',
          path: '/render/scene-01.jpg',
          contentType: 'image/jpeg',
        },
      ],
    });

    for (const [params] of vi.mocked(PutObjectCommand).mock.calls) {
      expect(params).toMatchObject({
        CacheControl: 'public, max-age=31536000, immutable',
      });
    }
  });
});

describe('uploadEpisodeVisualCheckpointImageToR2', () => {
  const input = {
    episodeId: '00000000-0000-4000-8000-000000000001',
    visualVersion: 'image-slideshow-v1',
    sourceHash: 'source-hash',
    assetId: 'asset-01',
    path: '/render/asset-01.image',
    contentType: 'image/png' as const,
  };
  const key =
    'episodes/00000000-0000-4000-8000-000000000001/visuals/image-slideshow-v1/checkpoints/source-hash/images/asset-01.png';

  it('uploads one immutable image under the checkpoint prefix and returns its URL', async () => {
    await expect(uploadEpisodeVisualCheckpointImageToR2(input)).resolves.toBe(
      `https://cdn.example.com/${key}`,
    );

    expect(createReadStream).toHaveBeenCalledWith('/render/asset-01.image');
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: key,
      Body: vi.mocked(createReadStream).mock.results[0]?.value,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('derives the extension from the content type', async () => {
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({
        ...input,
        contentType: 'image/jpeg',
      }),
    ).resolves.toMatch(/\/images\/asset-01\.jpg$/u);
  });

  it('rejects unsafe key segments before uploading', async () => {
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({ ...input, sourceHash: '../x' }),
    ).rejects.toThrow('Invalid video artifact visual source hash');
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({ ...input, assetId: 'a/b' }),
    ).rejects.toThrow('Invalid video artifact visual asset id');
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({ ...input, episodeId: '' }),
    ).rejects.toThrow('Invalid video artifact episode id');
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({
        ...input,
        visualVersion: '.v1',
      }),
    ).rejects.toThrow('Invalid video artifact visual renderer version');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    await expect(
      uploadEpisodeVisualCheckpointImageToR2({
        ...input,
        signal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(mockSend).not.toHaveBeenCalled();
  });
});
