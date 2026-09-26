import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTriggerServer } from './triggerServer.js';

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function start(run: Parameters<typeof createTriggerServer>[0]['run']) {
  const server = createTriggerServer({ run, log: () => undefined });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const trigger = { 'x-zap-trigger': '1', origin: 'http://localhost:8081' };

describe('trigger server', () => {
  it('starts one real run and reports its log and outcome', async () => {
    let finish!: () => void;
    const run = vi.fn(async (log: (line: string) => void) => {
      log('📰 News     x');
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
    expect(run).toHaveBeenCalledTimes(1);

    const again = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: trigger,
    });
    expect(again.status).toBe(409);
    expect(run).toHaveBeenCalledTimes(1);

    expect(await (await fetch(`${url}/runs/current`)).json()).toEqual({
      state: 'running',
      outcome: null,
      lines: ['📰 News     x'],
    });

    finish();
    await vi.waitFor(async () => {
      expect(await (await fetch(`${url}/runs/current`)).json()).toMatchObject({
        state: 'succeeded',
        outcome: 'confirmed',
      });
    });
  });

  it('records a failed run and accepts the next trigger', async () => {
    const run = vi
      .fn<(log: (line: string) => void) => Promise<string>>()
      .mockRejectedValueOnce(new Error('laya down'))
      .mockResolvedValue('confirmed');
    const url = await start(run);

    await fetch(`${url}/runs`, { method: 'POST', headers: trigger });
    await vi.waitFor(async () => {
      expect(await (await fetch(`${url}/runs/current`)).json()).toMatchObject({
        state: 'failed',
        outcome: 'Error: laya down',
      });
    });
    const next = await fetch(`${url}/runs`, {
      method: 'POST',
      headers: trigger,
    });
    expect(next.status).toBe(202);
  });

  it('refuses triggers without the header or from a non-local origin', async () => {
    const run = vi.fn(async () => 'confirmed');
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
