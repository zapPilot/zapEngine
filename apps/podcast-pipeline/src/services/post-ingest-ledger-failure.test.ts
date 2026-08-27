import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ capturePipelineException: vi.fn() }));
const supabase = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: sentry.capturePipelineException,
}));

// The real ops-ledger runs here, against a Supabase that refuses the RPC. This
// is the wiring the acceptance check exercises by mistyping the function name:
// a ledger that cannot write must never take an ingest down with it.
vi.mock('./supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase-client.js')>()),
  getPipelineSupabase: () => ({ rpc: supabase.rpc }),
}));

import { episodeListResponse, listRow } from '../__fixtures__/index-test.js';
import { buildUsageCostDetails } from './cost.js';
import { createHeavyWorkCoordinator } from './heavy-work.js';
import { performMultilingualIngestAndEnqueueVideo } from './post-ingest.js';

beforeEach(() => {
  vi.clearAllMocks();
  supabase.rpc.mockResolvedValue({
    data: null,
    error: {
      code: 'PGRST202',
      message:
        'Could not find the function from_fed_to_chain.ops_record_pipeline_run',
    },
  });
});

describe('ingest with an unwritable cost ledger', () => {
  it('returns the ingest result and reports the ledger failure as a warning', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await performMultilingualIngestAndEnqueueVideo(
      'https://example.com/article',
      'ja',
      {
        trigger: 'http',
        dependencies: {
          coordinator: createHeavyWorkCoordinator(),
          findEpisode: vi.fn().mockResolvedValue(null),
          performIngest: vi.fn().mockResolvedValue({
            episode: episodeListResponse(listRow({ language_code: 'ja' })),
            statusCode: 201,
            costUsd: 0,
            costDetails: buildUsageCostDetails([]),
          }),
          // Enqueue is left to fail too, so the assertion below proves the
          // ingest result survived the ledger rather than an early return.
          listLocalizations: vi.fn().mockResolvedValue([]),
        },
      },
    );

    expect(result.ingest.statusCode).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledWith(
      'ops_record_pipeline_run',
      expect.objectContaining({ p_pipeline: 'ingest', p_trigger: 'http' }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[ops-ledger] pipeline run not recorded',
      expect.objectContaining({ pipeline: 'ingest' }),
    );
    expect(sentry.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('ops_record_pipeline_run'),
      }),
      expect.objectContaining({ component: 'ingest', level: 'warning' }),
    );
  });
});
