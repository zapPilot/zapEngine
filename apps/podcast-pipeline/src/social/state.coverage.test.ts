import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    readFile: (...args: unknown[]) => {
      if (
        fsMocks.readFile.mock.calls.length > 0 ||
        fsMocks.readFile.getMockImplementation()
      ) {
        return fsMocks.readFile(...(args as []));
      }
      return (original.readFile as (...a: unknown[]) => unknown)(...args);
    },
    mkdir: (...args: unknown[]) => {
      if (fsMocks.mkdir.getMockImplementation()) {
        return fsMocks.mkdir(...(args as []));
      }
      return (original.mkdir as (...a: unknown[]) => unknown)(...args);
    },
    writeFile: (...args: unknown[]) => {
      if (fsMocks.writeFile.getMockImplementation()) {
        return fsMocks.writeFile(...(args as []));
      }
      return (original.writeFile as (...a: unknown[]) => unknown)(...args);
    },
    rename: (...args: unknown[]) => {
      if (fsMocks.rename.getMockImplementation()) {
        return fsMocks.rename(...(args as []));
      }
      return (original.rename as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import {
  DEFAULT_SOCIAL_STATE_PATH,
  getPublishedPlatform,
  markPlatformPublished,
  readPublishState,
} from './state.js';

describe('social publish state default path', () => {
  it('uses the default state path when the caller omits path', async () => {
    // WHY: existing tests always pass an explicit path, leaving the
    // `?? DEFAULT_SOCIAL_STATE_PATH` fallback uncovered.
    fsMocks.readFile.mockImplementation(async () => '{}');
    fsMocks.mkdir.mockImplementation(async () => undefined);
    fsMocks.writeFile.mockImplementation(async () => undefined);
    fsMocks.rename.mockImplementation(async () => undefined);
    try {
      await markPlatformPublished({
        episodeId: 'episode-default',
        platform: 'x',
        result: {
          published: true,
          publishedAt: '2026-08-11T00:00:00.000Z',
        },
      });
      expect(fsMocks.readFile).toHaveBeenCalledWith(
        DEFAULT_SOCIAL_STATE_PATH,
        'utf8',
      );
      expect(fsMocks.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.tmp-'),
        expect.any(String),
        'utf8',
      );
    } finally {
      fsMocks.readFile.mockReset();
      fsMocks.mkdir.mockReset();
      fsMocks.writeFile.mockReset();
      fsMocks.rename.mockReset();
    }
  });

  it('keeps language lanes isolated under one episode', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'social-state-lang-'));
    const path = join(directory, 'state.json');

    await markPlatformPublished({
      episodeId: 'episode-lang',
      platform: 'x',
      languageCode: 'ja',
      result: { published: true, publishedAt: '2026-08-11T00:00:00.000Z' },
      path,
    });

    const state = await readPublishState(path);
    expect(
      getPublishedPlatform(state, 'episode-lang', 'x', 'ja'),
    ).toBeDefined();
    expect(
      getPublishedPlatform(state, 'episode-lang', 'x', 'zh-Hant'),
    ).toBeUndefined();
  });
});
