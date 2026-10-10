import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SFX_KINDS, sfxFile } from '../../src/primitives/sfx-kinds';
import { synthesizeSfx, writeSfx } from './sfx';
import { readWav } from './wav';

const peak = (channels: readonly Float64Array[]) =>
  Math.max(
    ...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)),
  );

// Synthesis runs a reverb over every sample; under coverage instrumentation on
// a CI runner each effect takes a while, so each is rendered once and shared.
const sounds = new Map(SFX_KINDS.map((kind) => [kind, synthesizeSfx(kind)]));
const levels = new Map(
  [...sounds].map(([kind, pcm]) => [kind, peak(pcm.channels)]),
);

describe('synthesized sound effects', () => {
  it.each(SFX_KINDS)(
    '%s is audible stereo below full scale with a tail',
    (kind) => {
      const pcm = sounds.get(kind);
      expect(pcm?.sampleRate).toBe(48000);
      expect(pcm?.channels).toHaveLength(2);
      expect(pcm?.channels[0]?.length).toBe(pcm?.channels[1]?.length);
      expect(pcm?.channels[0]?.length).toBeGreaterThan(48000);
      expect(levels.get(kind)).toBeGreaterThan(0.01);
      expect(levels.get(kind)).toBeLessThan(0.99);
    },
  );

  it('renders byte-identical audio every time, seeded noise included', () => {
    expect(synthesizeSfx('whoosh').channels[1]).toEqual(
      sounds.get('whoosh')?.channels[1],
    );
  }, 30000);

  it('keeps the impact the loudest and the typing the quietest', () => {
    for (const level of levels.values()) {
      expect(levels.get('impact')).toBeGreaterThanOrEqual(level);
      expect(levels.get('type')).toBeLessThanOrEqual(level);
    }
  });

  it('writes one PCM16 WAV per kind where the runtime looks', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sfx-'));
    try {
      await writeSfx(dir);
      for (const kind of SFX_KINDS) {
        const pcm = readWav(await readFile(path.join(dir, sfxFile(kind))));
        expect(pcm.channels).toHaveLength(2);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
});
