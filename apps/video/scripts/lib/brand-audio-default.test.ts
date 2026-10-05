import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { getVideo } from '../../src/videos/catalog';
import { brandOptions, runBrandAudio } from './brand-audio-job';
import { BRAND_CLIPS } from './speech-plan';

vi.mock('./fish-audio', () => ({ synthesize: async () => Buffer.from('raw') }));
vi.mock('./media', () => ({
  MEDIA_TOOLS: {
    duration: async () => 1,
    run: async () =>
      JSON.stringify({
        input_i: '-18',
        input_tp: '-3',
        input_lra: '1',
        input_thresh: '-28',
        target_offset: '0',
      }),
  },
}));
it('uses default clock and logger without selecting a candidate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'brand-default-'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const files = await runBrandAudio({
      clip: BRAND_CLIPS['kokode']!,
      id: 'kokode',
      root,
      publicDir: path.join(root, 'public'),
      engine: 'engine',
      apiKey: 'key',
      options: brandOptions({ takes: '1' }),
      storyboard: getVideo('kokode-clinic').storyboard,
      baseline: {},
    });
    expect(files).toHaveLength(1);
  } finally {
    log.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
