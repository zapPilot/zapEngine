import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { publicDir, videoPaths } from '../../scripts/lib/paths';
import { parseVoManifest } from '../timeline/manifest';
import { buildTimeline } from '../timeline/timeline';
import { shots } from './calculator-pitch/shots';
import { getShots, getVideo, videoIds } from './catalog';

describe('getShots', () => {
  it('returns the shot list of a captured video', () => {
    expect(getShots('calculator-pitch')).toBe(shots);
  });

  it('refuses a video that has nothing to capture', () => {
    expect(getVideo('kokode-clinic').shots).toBeUndefined();
    expect(() => getShots('kokode-clinic')).toThrow(
      'Video "kokode-clinic" has no shots to capture.',
    );
  });

  it('refuses an unknown video', () => {
    expect(() => getShots('nope')).toThrow('Unknown video "nope"');
  });
});

it('ships every storyboard music source with matching provenance and README', () => {
  const readme = readFileSync(path.join(publicDir, 'music/README.md'), 'utf8');
  for (const id of videoIds) {
    const { storyboard } = getVideo(id);
    const src = path.join(publicDir, storyboard.music.src);
    expect(existsSync(src)).toBe(true);
    expect(readme).toContain(path.basename(src));
    expect(readme).toContain(storyboard.music.prompt);
    const metadata = JSON.parse(
      readFileSync(src.replace('.mp3', '.json'), 'utf8'),
    );
    expect(metadata.prompt).toBe(storyboard.music.prompt);
    expect(metadata.sha256).toBe(
      createHash('sha256').update(readFileSync(src)).digest('hex'),
    );
    const manifest = parseVoManifest(
      JSON.parse(readFileSync(videoPaths(id).voManifest, 'utf8')),
    );
    const seconds =
      buildTimeline(storyboard, manifest).durationInFrames / storyboard.fps;
    expect(metadata.report.durationSeconds).toBeGreaterThanOrEqual(seconds + 2);
    expect(metadata.report.leadingSilenceSeconds).toBeLessThanOrEqual(0.3);
    expect(metadata.report.loudness.tp).toBeLessThanOrEqual(-2);
  }
});
