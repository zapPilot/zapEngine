import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ffmpeg, mediaDuration } from './media';
import { publicDir, videoPaths, workspaceRoot } from './paths';

// Integration: these run Remotion's bundled ffmpeg and Mediabunny against a
// committed asset, so they prove the binaries the scripts depend on exist.
// Each call starts the Remotion CLI (~1 s locally), so CI gets headroom.
describe('media helpers', { timeout: 30_000 }, () => {
  it('runs the bundled ffmpeg and returns its log', async () => {
    const log = await ffmpeg([
      '-i',
      path.join(publicDir, 'music/bgm-03.mp3'),
      '-f',
      'null',
      '-',
    ]);
    expect(log).toContain('Audio: mp3');
  });

  it('rejects with the tail of the log when ffmpeg fails', async () => {
    await expect(
      ffmpeg(['-i', path.join(publicDir, 'missing.mp3')]),
    ).rejects.toThrow(/missing\.mp3/);
  });

  it('measures media duration', async () => {
    await expect(
      mediaDuration(path.join(publicDir, 'music/bgm-03.mp3')),
    ).resolves.toBeCloseTo(32, 1);
  });
});

describe('videoPaths', () => {
  it('derives every location from the video id', () => {
    const paths = videoPaths('demo');
    expect(path.relative(workspaceRoot, paths.voManifest)).toBe(
      'src/videos/demo/vo.manifest.json',
    );
    expect(path.relative(workspaceRoot, paths.captureManifest)).toBe(
      'src/videos/demo/captures.json',
    );
    expect(paths.voPublic).toBe('vo/demo');
    expect(paths.capturePublic).toBe('captures/demo');
    expect(path.relative(workspaceRoot, paths.work)).toBe('out/demo');
    expect(path.relative(workspaceRoot, paths.video)).toBe('out/demo.mp4');
    expect(path.basename(workspaceRoot)).toBe('video');
  });
});
