import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  generateHls: vi.fn(),
  step: vi.fn(),
  uploadHlsToR2: vi.fn(),
}));

vi.mock('../hls.js', () => ({
  generateHls: mocks.generateHls,
}));

vi.mock('../storage.js', () => ({
  uploadHlsToR2: mocks.uploadHlsToR2,
}));

vi.mock('./step.js', () => ({
  step: mocks.step,
}));

import { packageAndUploadHls } from './upload-stage.js';

describe('packageAndUploadHls', () => {
  beforeEach(() => {
    mocks.cleanup.mockReset().mockResolvedValue(undefined);
    mocks.generateHls.mockReset().mockResolvedValue({
      files: [
        {
          name: 'playlist.m3u8',
          path: '/render/hls/playlist.m3u8',
          contentType: 'application/vnd.apple.mpegurl',
        },
      ],
      playlistKey: 'playlist.m3u8',
      cleanup: mocks.cleanup,
    });
    mocks.uploadHlsToR2.mockReset().mockResolvedValue({
      hlsUrl:
        'https://cdn.example.com/episodes/episode-1/localizations/zh-Hant/classroom/playlist.m3u8',
      r2Prefix: 'episodes/episode-1/localizations/zh-Hant/classroom',
    });
    mocks.step
      .mockReset()
      .mockImplementation(
        async (name: string, operation: () => Promise<unknown>) => {
          try {
            return await operation();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new Error(`[step:${name}] ${message}`);
          }
        },
      );
  });

  it('keeps generated files alive through upload and then cleans them', async () => {
    let finishUpload!: (result: { hlsUrl: string; r2Prefix: string }) => void;
    mocks.uploadHlsToR2.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    const audio = Buffer.from('classroom-audio');

    const pending = packageAndUploadHls({
      audio,
      episodeId: 'episode-1',
      languageCode: 'zh-Hant',
      section: 'classroom',
      generateStepName: 'generateClassroomHls',
      uploadStepName: 'uploadClassroomHlsToR2',
    });

    await vi.waitFor(() =>
      expect(mocks.uploadHlsToR2).toHaveBeenCalledTimes(1),
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();

    const uploadResult = {
      hlsUrl:
        'https://cdn.example.com/episodes/episode-1/localizations/zh-Hant/classroom/playlist.m3u8',
      r2Prefix: 'episodes/episode-1/localizations/zh-Hant/classroom',
    };
    finishUpload(uploadResult);

    await expect(pending).resolves.toEqual(uploadResult);
    expect(mocks.generateHls).toHaveBeenCalledWith(audio);
    expect(mocks.uploadHlsToR2).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/render/hls/playlist.m3u8',
        }),
      ]),
      'episode-1',
      'zh-Hant',
      'classroom',
    );
    expect(mocks.step).toHaveBeenNthCalledWith(
      1,
      'generateClassroomHls',
      expect.any(Function),
    );
    expect(mocks.step).toHaveBeenNthCalledWith(
      2,
      'uploadClassroomHlsToR2',
      expect.any(Function),
    );
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it('preserves the upload step error and cleans generated files on failure', async () => {
    const error = new Error('R2 upload failed');
    mocks.uploadHlsToR2.mockRejectedValueOnce(error);

    await expect(
      packageAndUploadHls({
        audio: Buffer.from('main-audio'),
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        section: 'main',
        generateStepName: 'generateMainHls',
        uploadStepName: 'uploadMainHlsToR2',
      }),
    ).rejects.toThrow('[step:uploadMainHlsToR2] R2 upload failed');
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });
});
