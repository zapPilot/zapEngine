import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getPublishedPlatform,
  markPlatformPublished,
  readPublishState,
} from './state.js';

describe('social publish state', () => {
  it('starts empty and persists platforms independently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'social-state-'));
    const path = join(directory, 'state.json');

    expect(await readPublishState(path)).toEqual({});

    await markPlatformPublished({
      episodeId: 'episode-1',
      language: 'zh',
      platform: 'x',
      result: {
        published: true,
        publishedAt: '2026-08-11T00:00:00.000Z',
        url: 'https://x.com/example/status/1',
      },
      path,
    });

    let state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'zh', 'x')?.url).toBe(
      'https://x.com/example/status/1',
    );
    expect(
      getPublishedPlatform(state, 'episode-1', 'zh', 'rednote'),
    ).toBeUndefined();

    await markPlatformPublished({
      episodeId: 'episode-1',
      language: 'zh',
      platform: 'rednote',
      result: {
        published: true,
        publishedAt: '2026-08-11T00:01:00.000Z',
      },
      path,
    });

    state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'zh', 'x')).toBeDefined();
    expect(
      getPublishedPlatform(state, 'episode-1', 'zh', 'rednote'),
    ).toBeDefined();
  });
});
