import { describe, expect, it } from 'vitest';

import { createFlyOpsClient } from './fly-client.js';

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fly-client coverage', () => {
  it('honours a custom base url with a trailing slash', async () => {
    let seenUrl = '';
    const client = createFlyOpsClient({
      token: 't',
      baseUrl: 'https://custom.example/v1/',
      fetchImpl: (async (input) => {
        seenUrl = String(input);
        return json([]);
      }) as typeof fetch,
    });

    await client.listMachines('my-app');

    expect(seenUrl).toBe('https://custom.example/v1/apps/my-app/machines');
  });

  it('drops malformed machines while keeping every optional projection', async () => {
    const client = createFlyOpsClient({
      token: 't',
      fetchImpl: (async () =>
        json([
          {
            id: 'good',
            state: 'started',
            region: null,
            instance_id: null,
            created_at: null,
            updated_at: null,
            image_ref: null,
            config: null,
            events: [],
          },
          {
            id: 'group-empty',
            state: 'started',
            config: { metadata: { fly_process_group: '' } },
            events: [],
          },
          {
            id: 'group-numeric',
            state: 'started',
            config: { metadata: { fly_process_group: 42 } },
            events: [],
          },
          {
            id: 'image-partial',
            state: 'started',
            image_ref: { repository: null, tag: null, digest: null },
            events: [],
          },
          { unexpected: true },
        ])) as typeof fetch,
    });

    const machines = await client.listMachines('app');

    expect(machines.map((machine) => machine.id)).toEqual([
      'good',
      'group-empty',
      'group-numeric',
      'image-partial',
    ]);
    expect(machines[0]).toMatchObject({
      region: null,
      processGroup: null,
      image: null,
    });
    expect(machines[1]?.processGroup).toBeNull();
    expect(machines[2]?.processGroup).toBeNull();
    expect(machines[3]?.image).toEqual({
      repository: null,
      tag: null,
      digest: null,
    });
  });

  it('drops malformed events and sorts null timestamps deterministically', async () => {
    const client = createFlyOpsClient({
      token: 't',
      fetchImpl: (async () =>
        json([
          {
            id: 'm1',
            state: 'stopped',
            events: [
              {
                type: 'stop',
                status: 'stopped',
                source: 'flyd',
                timestamp: Date.parse('2026-08-30T01:00:00.000Z'),
              },
              { type: null, status: null, source: null, timestamp: null },
              {},
              42,
              { timestamp: 'not-a-number' },
            ],
          },
        ])) as typeof fetch,
    });

    const [machine] = await client.listMachines('app');

    expect(machine?.events).toHaveLength(3);
    expect(machine?.events[0]).toMatchObject({
      type: 'stop',
      at: '2026-08-30T01:00:00.000Z',
    });
    expect(machine?.events.slice(1)).toEqual([
      {
        type: null,
        status: null,
        source: null,
        at: null,
      },
      {
        type: null,
        status: null,
        source: null,
        at: null,
      },
    ]);
  });

  it('requests deleted machines when asked', async () => {
    let seenUrl = '';
    const client = createFlyOpsClient({
      token: 't',
      fetchImpl: (async (input) => {
        seenUrl = String(input);
        return json([]);
      }) as typeof fetch,
    });

    await client.listMachines('app', { includeDeleted: true });

    expect(seenUrl).toContain('?include_deleted=true');
  });
});
