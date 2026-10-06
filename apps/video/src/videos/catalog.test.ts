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

it('ships bounded loops with matching SHA, mastering and frame-aligned overlap', async () => {
  const { musicLibrary } = await import('../music/library');
  const { bedCopies } = await import('../primitives/music-bed');
  for (const id of videoIds) {
    const { storyboard } = getVideo(id);
    const loop = musicLibrary[storyboard.music.loop];
    const file = path.join(publicDir, 'music', `${loop.id}.mp3`);
    const bytes = readFileSync(file);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(loop.sha256);
    expect(bytes.length).toBeLessThanOrEqual(600 * 1024);
    expect(loop.report.durationSeconds).toBeGreaterThanOrEqual(
      (loop.periodSamples + loop.crossfadeSamples) / loop.sampleRate,
    );
    expect(Math.abs(loop.report.loudness.i + 18)).toBeLessThanOrEqual(1);
    expect(loop.report.loudness.tp).toBeLessThanOrEqual(-2);
    const manifest = parseVoManifest(
      JSON.parse(readFileSync(videoPaths(id).voManifest, 'utf8')),
    );
    const duration = buildTimeline(storyboard, manifest).durationInFrames;
    expect(
      bedCopies(
        duration,
        loop.periodSamples / 1600,
        loop.crossfadeSamples / 1600,
      ).at(-1)!.from,
    ).toBeLessThan(duration);
    const source = path.resolve(publicDir, '..', loop.source.file);
    expect(existsSync(source)).toBe(true);
    expect(
      createHash('sha256').update(readFileSync(source)).digest('hex'),
    ).toBe(loop.source.sha256);
  }
});

it('recomputes encoded loop seams in CI', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { musicLibrary } = await import('../music/library');
  const { decodePcm } = await import('../../scripts/lib/loop-job');
  const { seamMetrics } = await import('../../scripts/lib/dsp');
  const work = await mkdtemp(path.join(tmpdir(), 'loop-seams-'));
  try {
    for (const loop of Object.values(musicLibrary)) {
      const pcm = await decodePcm(
        path.join(publicDir, 'music', `${loop.id}.mp3`),
        path.join(work, `${loop.id}.wav`),
      );
      const mono = Float64Array.from(
        pcm.channels[0]!,
        (x, i) => (x + pcm.channels[1]![i]!) / 2,
      );
      const { rho, ...metrics } = seamMetrics(
        mono,
        loop.periodSamples,
        loop.crossfadeSamples,
        loop.sampleRate,
      );
      expect(rho).toBeCloseTo(loop.rho, 8);
      for (const key of Object.keys(metrics) as (keyof typeof metrics)[])
        expect(metrics[key]).toBeCloseTo(loop.seam[key], 8);
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}, 60000);
