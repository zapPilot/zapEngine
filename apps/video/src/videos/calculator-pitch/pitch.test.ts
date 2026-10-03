import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { staleLines } from '../../../scripts/lib/vo-cache';
import { parseCaptureManifest } from '../../captures/manifest';
import { parseVoManifest } from '../../timeline/manifest';
import { getVideo, videoIds } from '../catalog';
import { recorded, shot, timeline } from './assets';
import capturesJson from './captures.json';
import { facts, shortHex } from './facts';
import { type ShotId, shots } from './shots';
import { storyboard } from './storyboard';
import voJson from './vo.manifest.json';

const publicDir = path.resolve(import.meta.dirname, '../../../public');

/** Every `…Cue` prop (and nested `cue`) of a scene, which must be spoken in it. */
function cuesOf(props: unknown): string[] {
  if (typeof props !== 'object' || props === null) return [];
  return Object.entries(props).flatMap(([key, value]) =>
    typeof value === 'string'
      ? key === 'cue' || key.endsWith('Cue')
        ? [value]
        : []
      : cuesOf(value),
  );
}

describe('calculator-pitch narration', () => {
  const manifest = parseVoManifest(voJson);

  it('was synthesised from the current script (else run pnpm voiceover)', () => {
    expect(staleLines(storyboard, manifest)).toEqual([]);
    expect(manifest.videoId).toBe(storyboard.id);
  });

  it('has every clip it references on disk', () => {
    for (const clip of Object.values(manifest.lines)) {
      expect(existsSync(path.join(publicDir, clip.file)), clip.file).toBe(true);
    }
  });

  it('fits the submission limit with no estimated lines', () => {
    expect(timeline.estimatedLines).toEqual([]);
    expect(timeline.durationInFrames / storyboard.fps).toBeLessThanOrEqual(
      storyboard.maxSeconds,
    );
  });

  it('keys every visual cue to a phrase that is actually narrated', () => {
    for (const scene of storyboard.scenes) {
      const spoken = scene.vo.map((line) => line.text).join(' ');
      for (const cue of cuesOf(scene.props)) {
        expect(spoken, `${scene.id}: ${cue}`).toContain(cue);
      }
    }
  });
});

describe('calculator-pitch captures', () => {
  const manifest = parseCaptureManifest(capturesJson);

  it('cover every declared shot and target (else run pnpm capture)', () => {
    for (const [id, spec] of Object.entries(shots.shots)) {
      const captured = manifest.shots[id];
      expect(captured, id).toBeDefined();
      const names = (record: object) =>
        Object.keys(record).sort((a, b) => a.localeCompare(b));
      expect(names(captured?.targets ?? {}), id).toEqual(names(spec.targets));
      expect(captured?.checks.length ?? 0, id).toBeGreaterThanOrEqual(
        spec.checks.length,
      );
      expect(existsSync(path.join(publicDir, captured?.file ?? '')), id).toBe(
        true,
      );
    }
  });

  it('were taken from a page that shows these facts', () => {
    const checked = Object.values(manifest.shots)
      .flatMap((captured) => captured.checks)
      .join('\n');
    for (const claim of [
      shortHex(facts.address, 10, 6),
      shortHex(facts.runtimeCodehash, 10, 6),
      facts.example.btc.price,
      facts.example.verdict,
      facts.example.match,
      facts.hold.verdict,
    ]) {
      expect(checked).toContain(claim);
    }
    expect(manifest.url).toBe(facts.url);
  });

  it('recorded the block the bytecode check ran at', () => {
    expect(Number(recorded('identity', 'checkedAtBlock'))).toBeGreaterThan(
      facts.deployBlock,
    );
  });

  it('fails loudly on unknown shots and values', () => {
    expect(shot('receipt').deviceScaleFactor).toBe(shots.deviceScaleFactor);
    expect(() => shot('nope' as ShotId)).toThrow('Missing capture "nope"');
    expect(() => recorded('identity', 'nope')).toThrow(
      'Capture "identity" recorded no "nope".',
    );
  });
});

describe('catalog', () => {
  it('registers the pitch and rejects unknown ids', () => {
    expect(videoIds).toContain(storyboard.id);
    expect(getVideo(storyboard.id).shots).toBe(shots);
    expect(() => getVideo('nope')).toThrow('Unknown video "nope"');
  });
});
