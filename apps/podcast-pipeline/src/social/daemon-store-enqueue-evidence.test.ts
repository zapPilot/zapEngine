import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(
  (): {
    result: { data: { id: string } | null; error: unknown };
    info: ReturnType<typeof vi.fn>;
  } => ({
    result: { data: null, error: null },
    info: vi.fn(),
  }),
);
vi.mock('@sentry/node', () => ({ logger: { info: mocks.info } }));
vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => {
    const builder = {
      from: () => builder,
      upsert: () => builder,
      select: () => builder,
      maybeSingle: async () => mocks.result,
    };
    return builder;
  },
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));

import { enqueueSocialPublishJob } from './daemon-store.js';
import { withSocialDaemonTickTelemetry } from './daemon-tick-telemetry.js';

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('actual enqueue requests are counted in external tick evidence', () => {
  it('distinguishes a inserted row, successful empty duplicate, and database failure', async () => {
    directory = await mkdtemp(join(tmpdir(), 'social-store-evidence-'));
    const request = {
      episodeId: 'episode',
      platform: 'x' as const,
      scheduledAt: new Date().toISOString(),
    };
    const failure = new Error('DB unavailable');
    await expect(
      withSocialDaemonTickTelemetry(
        { now: new Date(), owner: 'test', directory },
        async () => {
          mocks.result = { data: { id: 'new' }, error: null };
          await expect(enqueueSocialPublishJob(request)).resolves.toBe(true);
          mocks.result = { data: null, error: null };
          await expect(enqueueSocialPublishJob(request)).resolves.toBe(false);
          mocks.result = { data: null, error: failure };
          await enqueueSocialPublishJob(request);
        },
      ),
    ).rejects.toBe(failure);
    expect(mocks.info).toHaveBeenCalledWith(
      'social_daemon_tick',
      expect.objectContaining({
        attempts: 3,
        inserted: 1,
        duplicates: 1,
        errors: 1,
        outcome: 'error',
      }),
    );
  });
});
