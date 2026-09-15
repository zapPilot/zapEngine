import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { createOperatorStore } from './store.js';

const fakeClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => fakeClient.current,
  };
});

function rpcClient(impl: (name: string) => { data: unknown; error: unknown }) {
  const rpc = vi.fn((name: string) => ({
    abortSignal: vi.fn().mockResolvedValue(impl(name)),
  }));
  return { rpc, client: { rpc } };
}

const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
});

beforeEach(() => {
  fakeClient.current = null;
  vi.unstubAllEnvs();
});

describe('operator store persistence branches', () => {
  it('fails closed when persistence is unconfigured', async () => {
    const store = createOperatorStore(readControlCenterConfig({}));

    await expect(store.history()).rejects.toThrow('not configured');
  });

  it('surfaces provider failures without leaking objects', async () => {
    const { rpc, client } = rpcClient(() => ({
      data: null,
      error: { message: 'row-level security' },
    }));
    fakeClient.current = client;

    await expect(createOperatorStore(CONFIGURED).history('fp')).rejects.toThrow(
      'row-level security',
    );
    expect(rpc).toHaveBeenCalledWith(
      'ops_operator_history',
      expect.objectContaining({ p_fingerprint: 'fp' }),
    );
  });

  it('records a heartbeat with cadence provenance', async () => {
    vi.stubEnv('GITHUB_SHA', '  abc123  ');
    vi.stubEnv('GITHUB_RUN_ID', '  999  ');
    const { rpc, client } = rpcClient(() => ({ data: null, error: null }));
    fakeClient.current = client;

    await createOperatorStore(CONFIGURED).recordHeartbeat('test', 'running');

    expect(rpc).toHaveBeenCalledWith(
      'ops_record_operator_heartbeat_v2',
      expect.objectContaining({
        p_actor: 'test',
        p_state: 'running',
        p_cadence_minutes: expect.any(Number),
        p_source_sha: 'abc123',
        p_run_id: '999',
      }),
    );
  });

  it('falls back to the legacy heartbeat while the migration propagates', async () => {
    const { rpc, client } = rpcClient((name) =>
      name === 'ops_record_operator_heartbeat_v2'
        ? {
            data: null,
            error: {
              message:
                'Could not find the function ops_record_operator_heartbeat_v2 in the schema cache',
            },
          }
        : { data: null, error: null },
    );
    fakeClient.current = client;

    await createOperatorStore(CONFIGURED).recordHeartbeat('test', 'failed');

    expect(rpc).toHaveBeenNthCalledWith(2, 'ops_record_operator_heartbeat', {
      p_actor: 'test',
      p_state: 'failed',
    });
  });

  it('rethrows heartbeat failures unrelated to the migration', async () => {
    const { client } = rpcClient(() => ({
      data: null,
      error: { message: 'connection reset' },
    }));
    fakeClient.current = client;

    await expect(
      createOperatorStore(CONFIGURED).recordHeartbeat('test', 'running'),
    ).rejects.toThrow('connection reset');
  });

  it('parses heartbeat, history, runtime, and render targets', async () => {
    const heartbeat = {
      observedAt: '2026-09-10T00:00:00.000Z',
      actor: 'github-actions',
      state: 'succeeded',
      failureStreak: 0,
      cadenceMinutes: 60,
      sourceSha: 'sha',
      runId: '1',
    };
    const history = [{ id: 'cycle-1' }];
    const runtime = [
      {
        source: 'render',
        service: '@zapengine/podcast-pipeline',
        recordId: '22222222-2222-4222-8222-222222222222',
        observedAt: '2026-09-10T00:00:00.000Z',
        correlation: {},
      },
    ];
    const targets = [
      {
        episodeId: '11111111-1111-4111-8111-111111111111',
        localizationId: '22222222-2222-4222-8222-222222222222',
        renderStatus: 'failed',
        renderCompletedAt: null,
        renderLeaseExpiresAt: null,
        visualStatus: 'completed',
        visualVersion: 'current',
        deploymentOpen: true,
        abandonedAt: null,
      },
    ];
    const { client } = rpcClient((name) => {
      if (name === 'ops_operator_heartbeat') {
        return { data: heartbeat, error: null };
      }
      if (name === 'ops_operator_history') {
        return { data: history, error: null };
      }
      if (name === 'ops_runtime_records') {
        return { data: runtime, error: null };
      }
      return { data: targets, error: null };
    });
    fakeClient.current = client;
    const store = createOperatorStore(CONFIGURED);

    await expect(store.heartbeat()).resolves.toEqual(heartbeat);
    await expect(store.history()).resolves.toEqual(history);
    await expect(store.runtime('localizationId', 'x')).resolves.toEqual(
      runtime,
    );
    await expect(store.renderTargets()).resolves.toEqual(targets);
  });

  it('returns null when no heartbeat was ever recorded', async () => {
    const { client } = rpcClient(() => ({ data: null, error: null }));
    fakeClient.current = client;

    await expect(
      createOperatorStore(CONFIGURED).heartbeat(),
    ).resolves.toBeNull();
  });
});
