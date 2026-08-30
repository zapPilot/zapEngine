import { describe, expect, it } from 'vitest';

import { createFlyOpsClient, FlyOpsHttpError } from './fly-client.js';

describe('createFlyOpsClient', () => {
  it('uses the public Machines API with bearer auth and projects bounded machine fields', async () => {
    let authorization: string | null = null;
    const client = createFlyOpsClient({
      token: 'read-only-token',
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(
          'https://api.machines.dev/v1/apps/from-fed-to-chain-api/machines',
        );
        authorization = new Headers(init?.headers).get('authorization');
        return json([
          {
            id: 'machine-1',
            state: 'stopped',
            region: 'iad',
            created_at: '2026-08-30T00:00:00.000Z',
            updated_at: '2026-08-30T01:00:00.000Z',
            config: {
              metadata: { fly_process_group: 'render', secret: 'hidden' },
              env: { API_KEY: 'hidden' },
            },
            image_ref: { repository: 'registry.fly.io/app', digest: 'sha256:1' },
            events: [
              {
                type: 'stop',
                status: 'stopped',
                source: 'flyd',
                timestamp: Date.parse('2026-08-30T01:00:00.000Z'),
              },
            ],
          },
        ]);
      },
    });

    const result = await client.listMachines('from-fed-to-chain-api');

    expect(authorization).toBe('Bearer read-only-token');
    expect(result).toEqual([
      {
        id: 'machine-1',
        name: null,
        state: 'stopped',
        region: 'iad',
        processGroup: 'render',
        instanceId: null,
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T01:00:00.000Z',
        image: {
          repository: 'registry.fly.io/app',
          tag: null,
          digest: 'sha256:1',
        },
        events: [
          {
            type: 'stop',
            status: 'stopped',
            source: 'flyd',
            at: '2026-08-30T01:00:00.000Z',
          },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('API_KEY');
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('preserves HTTP status for missing-app classification', async () => {
    const client = createFlyOpsClient({
      token: 'token',
      fetchImpl: async () => new Response('missing', { status: 404 }),
    });

    await expect(client.listMachines('missing-app')).rejects.toMatchObject({
      name: 'FlyOpsHttpError',
      status: 404,
    } satisfies Partial<FlyOpsHttpError>);
  });

  it('rejects an unexpected response shape rather than treating it as empty', async () => {
    const client = createFlyOpsClient({
      token: 'token',
      fetchImpl: async () => json({ machines: [] }),
    });

    await expect(client.listMachines('alpha-etl')).rejects.toThrow(
      'returned a non-array body',
    );
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
