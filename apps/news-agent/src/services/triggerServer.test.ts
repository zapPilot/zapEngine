import type { AddressInfo } from 'node:net';

import { AgentRunStatusSchema } from '@zapengine/types/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DemoOutcome, DemoProgress } from './demo.js';
import { createTriggerServer } from './triggerServer.js';

type Run = (
  log: (line: string) => void,
  progress: (event: DemoProgress) => void,
) => Promise<DemoOutcome>;

const EPISODE = '0f85db1e-ae06-45ea-89a7-360ec63ff072';

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function start(run: Run) {
  let clock = 1_000;
  const server = createTriggerServer({
    episode: EPISODE,
    run,
    log: () => undefined,
    now: () => clock++,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const trigger = { 'x-zap-trigger': '1', origin: 'http://localhost:8081' };

// Every status the server sends must satisfy the contract the app parses.
async function status(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  return AgentRunStatusSchema.parse(await response.json());
}
const current = async (url: string) =>
  status(await fetch(`${url}/runs/current`));

describe('trigger server', () => {
  it('reports idle before any run', async () => {
    const url = await start(vi.fn<Run>());
    expect(await current(url)).toMatchObject({
      state: 'idle',
      episode: EPISODE,
      startedAt: null,
    });
  });

  it('starts one real run and reports its live progress', async () => {
    let finish!: () => void;
    let progress!: (event: DemoProgress) => void;
    const run = vi.fn<Run>(async (_log, report) => {
      progress = report;
      await new Promise<void>((resolve) => (finish = resolve));
      return 'confirmed';
    });
    const url = await start(run);

    const started = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: trigger,
    });
    expect(started.status).toBe(202);
    expect(started.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:8081',
    );
    const accepted = await status(started);
    expect(accepted).toMatchObject({ state: 'running', startedAt: 1_000 });
    expect(accepted.steps.news.state).toBe('active');
    expect(run).toHaveBeenCalledTimes(1);

    progress({
      step: 'sign',
      text: 'Signed swap locally, broadcast via MultiBaas',
      transaction: { kind: 'swap', index: 3, total: 5 },
    });
    const again = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: trigger,
    });
    expect(again.status).toBe(409);
    expect(run).toHaveBeenCalledTimes(1);
    const busy = await status(again);
    expect(busy.transaction).toEqual({ kind: 'swap', index: 3, total: 5 });
    expect(busy.steps.sign).toEqual({
      state: 'active',
      entries: [
        { text: 'Signed swap locally, broadcast via MultiBaas', link: null },
      ],
    });

    finish();
    await vi.waitFor(async () => {
      expect(await current(url)).toMatchObject({
        state: 'succeeded',
        finishedAt: 1_001,
      });
    });
  });

  it('records a failed run and accepts the next trigger', async () => {
    const run = vi
      .fn<Run>()
      .mockRejectedValueOnce(
        new Error('laya down at https://secret.example/key'),
      )
      .mockResolvedValue('confirmed');
    const url = await start(run);

    await fetch(`${url}/runs`, { method: 'POST', headers: trigger });
    await vi.waitFor(async () => {
      const failed = await current(url);
      expect(failed).toMatchObject({
        state: 'failed',
        error: 'Error: laya down at <url>',
      });
      expect(failed.steps.news.state).toBe('failed');
    });
    const next = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: trigger,
    });
    expect(next.status).toBe(202);
    expect(await status(next)).toMatchObject({ state: 'running', error: null });
  });

  it('refuses triggers without the header or from a non-local origin', async () => {
    const run = vi.fn<Run>(async () => 'confirmed');
    const url = await start(run);

    const bare = await fetch(`${url}/runs`, { method: 'POST' });
    expect(bare.status).toBe(400);
    const foreign = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: { ...trigger, origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('answers the CORS preflight for the local app', async () => {
    const url = await start(async () => 'confirmed');
    const preflight = await fetch(`${url}/runs`, {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:8081' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'x-zap-trigger',
    );
  });
});
