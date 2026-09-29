import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeSocialPublishJob: vi.fn(),
  getPublishedPlatform: vi.fn(),
  readPublishState: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  completeSocialPublishJob: mocks.completeSocialPublishJob,
}));

vi.mock('./state.js', () => ({
  getPublishedPlatform: mocks.getPublishedPlatform,
  readPublishState: mocks.readPublishState,
}));

import type { SocialPublishJobRow } from './daemon-store.js';
import { reconcileLocalPublishedJob } from './local-publish-recovery.js';

function job(
  overrides: Partial<SocialPublishJobRow> = {},
): SocialPublishJobRow {
  return {
    id: 'job-1',
    episode_id: 'episode-1',
    platform: 'x',
    language_code: null,
    ...overrides,
  } as SocialPublishJobRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readPublishState.mockResolvedValue({});
});

describe('reconcileLocalPublishedJob coverage', () => {
  it('returns false when no local publication evidence exists', async () => {
    mocks.getPublishedPlatform.mockReturnValue(undefined);

    await expect(
      reconcileLocalPublishedJob(job(), 'owner', vi.fn()),
    ).resolves.toBe(false);

    expect(mocks.getPublishedPlatform).toHaveBeenCalledWith(
      {},
      'episode-1',
      'x',
      'zh-Hant',
    );
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
  });

  it('reconciles a null-language historical row without appending an absent url', async () => {
    mocks.getPublishedPlatform.mockReturnValue({
      published: true,
      publishedAt: '2026-09-01T00:00:00.000Z',
      url: null,
    });
    const log = vi.fn();

    await expect(reconcileLocalPublishedJob(job(), 'owner', log)).resolves.toBe(
      true,
    );

    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: 'owner',
      completedAt: new Date('2026-09-01T00:00:00.000Z'),
      socialPostId: null,
    });
    expect(log).toHaveBeenCalledWith(
      expect.not.stringContaining(' · https://'),
    );
  });

  it('includes a historical publication url in the reconciliation log', async () => {
    mocks.getPublishedPlatform.mockReturnValue({
      published: true,
      publishedAt: '2026-09-01T00:00:00.000Z',
      url: 'https://x.com/example/status/1',
    });
    const log = vi.fn();

    await reconcileLocalPublishedJob(
      job({ language_code: 'en' }),
      'owner',
      log,
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(' · https://x.com/example/status/1'),
    );
  });

  it.each([
    { published: false, publishedAt: '2026-09-01T00:00:00.000Z' },
    { published: true, publishedAt: 'not-a-date' },
  ])('rejects invalid local publication evidence %#', async (existing) => {
    mocks.getPublishedPlatform.mockReturnValue(existing);

    await expect(
      reconcileLocalPublishedJob(
        job({ language_code: 'ja' }),
        'owner',
        vi.fn(),
      ),
    ).rejects.toThrow('Invalid local publication evidence');
  });
});
