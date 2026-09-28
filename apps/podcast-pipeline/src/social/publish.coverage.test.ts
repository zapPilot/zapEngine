import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { publishSocialPlatforms } from './publish.js';

describe('publish warnings coverage', () => {
  it('logs publisher warnings and returns them on the outcome', async () => {
    // WHY: the warnings loop only runs when transport reports warnings.
    const directory = await mkdtemp(join(tmpdir(), 'publish-warn-'));
    const statePath = join(directory, 'state.json');
    const logs: string[] = [];
    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-warn',
      languageCode: 'zh-Hant',
      jobs: [
        {
          platform: 'x',
          publish: async () => ({
            status: 'published',
            publishedAt: '2026-08-15T00:00:00.000Z',
            url: 'https://x.com/s/1',
            warnings: ['thumbnail degraded'],
          }),
        },
      ],
      force: false,
      statePath,
      onLog: (message: string) => logs.push(message),
    });
    expect(outcomes).toEqual([
      {
        platform: 'x',
        status: 'published',
        url: 'https://x.com/s/1',
        warnings: ['thumbnail degraded'],
      },
    ]);
    expect(logs).toContainEqual(expect.stringContaining('thumbnail degraded'));
  });

  it('omits url and warnings keys when transport reports neither', async () => {
    // WHY: the outcome spreads only include url/warnings when present.
    const directory = await mkdtemp(join(tmpdir(), 'publish-bare-'));
    const statePath = join(directory, 'state.json');
    const outcomes = await publishSocialPlatforms({
      episodeId: 'episode-bare',
      jobs: [
        {
          platform: 'threads',
          publish: async () => ({
            status: 'published',
            publishedAt: '2026-08-15T00:00:00.000Z',
          }),
        },
      ],
      force: true,
      statePath,
      persistPublished: vi.fn(),
    });
    expect(outcomes).toEqual([{ platform: 'threads', status: 'published' }]);
  });
});
