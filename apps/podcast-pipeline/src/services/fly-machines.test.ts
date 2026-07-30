import { describe, expect, it, vi } from 'vitest';

import {
  createFlyMachinesClient,
  FLY_INTERNAL_API_BASE_URL,
  FlyApiError,
} from './fly-machines.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  return createFlyMachinesClient({
    appName: 'from-fed-to-chain-api',
    token: 'fly-token',
    fetchImpl,
  });
}

describe('createFlyMachinesClient', () => {
  it('lists machines from the internal API with a bearer token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'machine-render',
          state: 'stopped',
          config: { metadata: { fly_process_group: 'render' } },
        },
        {
          id: 'machine-app',
          state: 'started',
          config: { metadata: { fly_process_group: 'app' } },
        },
      ]),
    );

    const machines = await makeClient(fetchImpl as never).listMachines();

    expect(machines).toEqual([
      { id: 'machine-render', state: 'stopped', processGroup: 'render' },
      { id: 'machine-app', state: 'started', processGroup: 'app' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${FLY_INTERNAL_API_BASE_URL}/v1/apps/from-fed-to-chain-api/machines`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          authorization: 'Bearer fly-token',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('reports a null process group when metadata is missing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ id: 'machine-1', state: 'started' }]));

    await expect(
      makeClient(fetchImpl as never).listMachines(),
    ).resolves.toEqual([
      { id: 'machine-1', state: 'started', processGroup: null },
    ]);
  });

  it('drops entries without a usable id or state instead of throwing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([{ id: 'machine-1' }, null, { state: 'started' }]),
      );

    await expect(
      makeClient(fetchImpl as never).listMachines(),
    ).resolves.toEqual([]);
  });

  it('rejects a non-array machine list', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'nope' }));

    await expect(makeClient(fetchImpl as never).listMachines()).rejects.toThrow(
      'non-array machine list',
    );
  });

  it('starts a machine by id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, previous_state: 'stopped' }));

    await makeClient(fetchImpl as never).startMachine('machine-render');

    expect(fetchImpl).toHaveBeenCalledWith(
      `${FLY_INTERNAL_API_BASE_URL}/v1/apps/from-fed-to-chain-api/machines/machine-render/start`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('accepts a 204 start response with no body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      makeClient(fetchImpl as never).startMachine('machine-render'),
    ).resolves.toBeUndefined();
  });

  it.each([
    [401, 'an expired token'],
    [500, 'a Fly outage'],
  ])(
    'surfaces HTTP %i as a FlyApiError carrying the status (%s)',
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: 'denied' }, status));

      await expect(
        makeClient(fetchImpl as never).startMachine('machine-render'),
      ).rejects.toMatchObject({
        name: 'FlyApiError',
        status,
      });
    },
  );

  it('exposes FlyApiError for instanceof checks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 403));

    await expect(
      makeClient(fetchImpl as never).listMachines(),
    ).rejects.toBeInstanceOf(FlyApiError);
  });

  it('honours an overridden base URL and timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = createFlyMachinesClient({
      appName: 'app with spaces',
      token: 'token',
      baseUrl: 'https://api.machines.dev',
      timeoutMs: 25,
      fetchImpl: fetchImpl as never,
    });

    await client.listMachines();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.machines.dev/v1/apps/app%20with%20spaces/machines',
      expect.anything(),
    );
  });
});
