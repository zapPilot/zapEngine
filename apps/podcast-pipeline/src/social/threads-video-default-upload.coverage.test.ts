import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  s3Options: undefined as unknown,
  uploadOptions: undefined as unknown,
  done: vi.fn(),
  createReadStream: vi.fn(() => ({ stream: true })),
  requiredEnv: vi.fn((name: string) => {
    const values: Record<string, string> = {
      R2_ENDPOINT: 'https://r2.example.test',
      R2_ACCESS_KEY_ID: 'access',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_NAME: 'bucket',
    };
    const value = values[name];
    if (!value) throw new Error(`Unexpected env: ${name}`);
    return value;
  }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(options: unknown) {
      mocks.s3Options = options;
    }
  },
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(options: unknown) {
      mocks.uploadOptions = options;
    }
    done() {
      return mocks.done();
    }
  },
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  createReadStream: mocks.createReadStream,
}));

vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
  getRequiredEnv: mocks.requiredEnv,
}));

import { prepareThreadsVideoUrl } from './threads-video.js';

let directory = '';

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.done.mockResolvedValue(undefined);
  directory = await mkdtemp(join(tmpdir(), 'threads-default-upload-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('Threads default R2 upload coverage', () => {
  it('uploads an existing prepared teaser through the built-in multipart uploader', async () => {
    const teaserPath = join(directory, 'teaser.mp4');
    await writeFile(teaserPath, 'video');

    const url = await prepareThreadsVideoUrl(
      'https://media.example.test/video.mp4',
      {
        preparedVideoPath: teaserPath,
        tempDir: directory,
        publicBaseUrl: 'https://cdn.example.test/',
      },
    );

    expect(url).toMatch(
      /^https:\/\/cdn\.example\.test\/transient\/social\/threads\/[a-f0-9]{24}\/v1\/video\.mp4$/,
    );
    expect(mocks.s3Options).toEqual({
      region: 'auto',
      endpoint: 'https://r2.example.test',
      credentials: {
        accessKeyId: 'access',
        secretAccessKey: 'secret',
      },
      forcePathStyle: true,
    });
    expect(mocks.createReadStream).toHaveBeenCalledWith(teaserPath);
    expect(mocks.uploadOptions).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          Bucket: 'bucket',
          Key: expect.stringMatching(
            /^transient\/social\/threads\/[a-f0-9]{24}\/v1\/video\.mp4$/,
          ),
          Body: { stream: true },
          ContentType: 'video/mp4',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
        leavePartsOnError: false,
      }),
    );
    expect(mocks.done).toHaveBeenCalledOnce();
  });
});
