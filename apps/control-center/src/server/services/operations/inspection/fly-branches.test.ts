import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../../config/env.js';
import { FlyOpsHttpError } from '../fly-client.js';
import { inspectFlySignal } from './fly.js';

const NOW = new Date('2026-09-10T00:00:00.000Z');

describe('inspectFlySignal branches', () => {
  it('reports unsupported kinds without fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:issues/my-app',
      parsed: { source: 'fly', kind: 'issues', key: 'my-app' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('unsupported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports unavailable when the token is unset', async () => {
    const result = await inspectFlySignal({
      config: readControlCenterConfig({}),
      fingerprint: 'fly:app/my-app',
      parsed: { source: 'fly', kind: 'app', key: 'my-app' },
      inspectedAt: NOW,
      fetchImpl: vi.fn<typeof fetch>(),
    });

    expect(result.status).toBe('unavailable');
    expect(result.gaps).toHaveLength(1);
  });

  it('reports an unparseable process-group boundary without fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:process-group/noslash',
      parsed: { source: 'fly', kind: 'process-group', key: 'noslash' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('unsupported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports not-found for an unknown app', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new FlyOpsHttpError('missing', 404));
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:app/missing',
      parsed: { source: 'fly', kind: 'app', key: 'missing' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result).toMatchObject({ status: 'not-found', source: 'fly' });
  });

  it('rethrows non-404 provider failures', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new FlyOpsHttpError('boom', 500));

    await expect(
      inspectFlySignal({
        config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
        fingerprint: 'fly:app/my-app',
        parsed: { source: 'fly', kind: 'app', key: 'my-app' },
        inspectedAt: NOW,
        fetchImpl,
      }),
    ).rejects.toThrow('boom');
  });

  it('inspects an app without a process group using the default group', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'm1',
            state: 'started',
            region: 'iad',
            created_at: '2026-09-09T00:00:00.000Z',
            updated_at: '2026-09-10T00:00:00.000Z',
            config: { metadata: {} },
            events: [],
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:app/my-app',
      parsed: { source: 'fly', kind: 'app', key: 'my-app' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    expect(result.summary).toContain('1 Machine inspected.');
    expect(result.evidence).toMatchObject({ app: 'my-app', totalMachines: 1 });
  });

  it('sorts scoped machines newest-first and caps the evidence window', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          Array.from({ length: 7 }, (_, index) => ({
            id: `m${index}`,
            state: 'started',
            region: 'iad',
            created_at: '2026-09-09T00:00:00.000Z',
            updated_at: `2026-09-09T0${index}:00:00.000Z`,
            config: { metadata: { fly_process_group: 'render' } },
            events: [],
          })),
        ),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:process-group/my-app/render',
      parsed: { source: 'fly', kind: 'process-group', key: 'my-app/render' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    expect(result.summary).toContain('my-app/render: 5 Machines inspected.');
    const machines = result.evidence['machines'] as Array<{ id: string }>;
    expect(machines).toHaveLength(5);
    expect(machines[0]?.id).toBe('m6');
    expect(result.entities.map((entity) => entity.type)).toContain(
      'fly-process-group',
    );
  });

  it('sorts machines with missing timestamps last and pluralizes', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'm-none',
            state: 'started',
            region: 'iad',
            config: { metadata: {} },
          },
          {
            id: 'm-created',
            state: 'started',
            region: 'iad',
            created_at: '2026-09-09T06:00:00.000Z',
            config: { metadata: {} },
          },
          {
            id: 'm-updated',
            state: 'started',
            region: 'iad',
            created_at: '2026-09-09T00:00:00.000Z',
            updated_at: '2026-09-10T00:00:00.000Z',
            config: { metadata: {} },
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:app/my-app',
      parsed: { source: 'fly', kind: 'app', key: 'my-app' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.status).toBe('ok');
    expect(result.summary).toBe('my-app: 3 Machines inspected.');
    const machines = result.evidence['machines'] as Array<{ id: string }>;
    expect(machines.map((machine) => machine.id)).toEqual([
      'm-updated',
      'm-created',
      'm-none',
    ]);
  });

  it('filters out machines from other process groups', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'render-1',
            state: 'started',
            region: 'iad',
            config: { metadata: { fly_process_group: 'render' } },
          },
          {
            id: 'app-1',
            state: 'started',
            region: 'iad',
            config: { metadata: { fly_process_group: 'app' } },
          },
        ]),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await inspectFlySignal({
      config: readControlCenterConfig({ FLY_OPS_TOKEN: 'token' }),
      fingerprint: 'fly:process-group/my-app/render',
      parsed: { source: 'fly', kind: 'process-group', key: 'my-app/render' },
      inspectedAt: NOW,
      fetchImpl,
    });

    expect(result.evidence).toMatchObject({ totalMachines: 1 });
  });
});
