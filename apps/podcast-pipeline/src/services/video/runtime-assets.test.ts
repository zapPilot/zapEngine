import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BGM_TRACK_IDS } from './manifest.js';
import {
  type BgmTrackId,
  bgmTrackPath,
  pickBgmTrack,
  videoAssetPaths,
} from './runtime-assets.js';

describe('videoAssetPaths', () => {
  it('resolves every bundled runtime asset to an existing absolute path', async () => {
    const filePaths = [
      videoAssetPaths.notoSansCjkTcRegular,
      videoAssetPaths.notoSansCjkTcBold,
      videoAssetPaths.jetBrainsMonoSemibold,
      videoAssetPaths.logo,
      videoAssetPaths.usStatesMap,
    ];

    expect(isAbsolute(videoAssetPaths.root)).toBe(true);
    expect(isAbsolute(videoAssetPaths.fontsDirectory)).toBe(true);
    expect(filePaths.every(isAbsolute)).toBe(true);
    const fileStats = await Promise.all(filePaths.map((path) => stat(path)));
    expect(fileStats.every((entry) => entry.isFile())).toBe(true);
    expect(fileStats.every((entry) => entry.size > 0)).toBe(true);
    expect((await stat(videoAssetPaths.fontsDirectory)).isDirectory()).toBe(
      true,
    );
  });

  it('ships every declared BGM track as a playable bundled file', async () => {
    const trackStats = await Promise.all(
      BGM_TRACK_IDS.map((trackId) => stat(bgmTrackPath(trackId))),
    );
    expect(trackStats.every((entry) => entry.isFile())).toBe(true);
    expect(trackStats.every((entry) => entry.size > 0)).toBe(true);
    expect((await stat(videoAssetPaths.musicDirectory)).isDirectory()).toBe(
      true,
    );
    expect(() => bgmTrackPath('bgm-99' as BgmTrackId)).toThrow(
      'Unknown BGM track: bgm-99',
    );
  });

  it('picks the same BGM track deterministically per episode', () => {
    const episodeId = '9ee737b4-c3d3-4f88-9837-ccc7fc20704e';
    const first = pickBgmTrack(episodeId);
    expect(pickBgmTrack(episodeId)).toBe(first);
    expect(BGM_TRACK_IDS).toContain(first);

    const spread = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(pickBgmTrack),
    );
    expect(spread.size).toBeGreaterThan(1);
  });

  it('uses the same package-relative asset location from source and dist', () => {
    const packageUrl = new URL('../../../', import.meta.url);
    const sourceModuleUrl = new URL(
      'src/services/video/runtime-assets.ts',
      packageUrl,
    );
    const distModuleUrl = new URL(
      'dist/services/video/runtime-assets.js',
      packageUrl,
    );
    const resolveAssets = (moduleUrl: URL): string =>
      new URL('../../../assets/video/', moduleUrl).href;
    const expectedUrl = new URL('assets/video/', packageUrl).href;

    expect(resolveAssets(sourceModuleUrl)).toBe(expectedUrl);
    expect(resolveAssets(distModuleUrl)).toBe(expectedUrl);
    expect(pathToFileURL(videoAssetPaths.root).href).toBe(expectedUrl);
  });
});
