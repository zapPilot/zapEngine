import { mkdtemp, writeFile } from 'node:fs/promises';
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
      platform: 'x',
      result: {
        published: true,
        publishedAt: '2026-08-11T00:00:00.000Z',
        url: 'https://x.com/example/status/1',
      },
      path,
    });

    let state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'x')?.url).toBe(
      'https://x.com/example/status/1',
    );
    expect(getPublishedPlatform(state, 'episode-1', 'rednote')).toBeUndefined();

    await markPlatformPublished({
      episodeId: 'episode-1',
      platform: 'rednote',
      result: {
        published: true,
        publishedAt: '2026-08-11T00:01:00.000Z',
      },
      path,
    });

    state = await readPublishState(path);
    expect(getPublishedPlatform(state, 'episode-1', 'x')).toBeDefined();
    expect(getPublishedPlatform(state, 'episode-1', 'rednote')).toBeDefined();
  });

  it('rejects non-object persisted state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'social-state-invalid-'));
    const path = join(directory, 'state.json');
    await writeFile(path, '[]', 'utf8');

    await expect(readPublishState(path)).rejects.toThrow(
      `Invalid social publisher state at ${path}.`,
    );
  });

  it('surfaces malformed JSON instead of silently resetting publish history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'social-state-malformed-'));
    const path = join(directory, 'state.json');
    await writeFile(path, '{broken', 'utf8');

    await expect(readPublishState(path)).rejects.toBeInstanceOf(SyntaxError);
  });
});
