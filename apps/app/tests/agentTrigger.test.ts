import { describe, expect, it, vi } from 'vitest';

import {
  fetchAgentRunStatus,
  isLocalHostname,
  runStatusRefetchInterval,
  startAgentRun,
} from '@/integration/agentTrigger';

import { agentRunStatus } from './support/agentRunStatus';

const URL = 'http://127.0.0.1:8787';
const running = agentRunStatus({ activeStep: 'news' });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('fetchAgentRunStatus', () => {
  it('reads the current run without any cache', async () => {
    const fetchImpl = vi.fn(async () => json(running));
    await expect(fetchAgentRunStatus(URL, fetchImpl)).resolves.toEqual(running);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/runs/current`, {
      cache: 'no-store',
    });
  });

  it('reports an agent that is not serving as null', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchAgentRunStatus(URL, fetchImpl)).resolves.toBeNull();
  });

  it('throws on a refusal or a status outside the contract', async () => {
    await expect(
      fetchAgentRunStatus(
        URL,
        vi.fn(async () => json({}, 500)),
      ),
    ).rejects.toThrow('Agent status failed: 500');
    await expect(
      fetchAgentRunStatus(
        URL,
        vi.fn(async () => json({ state: 'running', lines: [] })),
      ),
    ).rejects.toThrow();
  });
});

describe('startAgentRun', () => {
  it('posts the trigger header once and returns the accepted status', async () => {
    const fetchImpl = vi.fn(async () => json(running, 202));
    await expect(startAgentRun(URL, fetchImpl)).resolves.toEqual({
      result: 'started',
      status: running,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/runs`, {
      method: 'POST',
      headers: { 'x-zap-trigger': '1' },
      cache: 'no-store',
    });
  });

  it('reports a run already in progress with its status', async () => {
    const fetchImpl = vi.fn(async () => json(running, 409));
    await expect(startAgentRun(URL, fetchImpl)).resolves.toEqual({
      result: 'busy',
      status: running,
    });
  });

  it('never throws after the agent accepted, even on an unreadable body', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('not json', { status: 202 }),
    );
    await expect(startAgentRun(URL, fetchImpl)).resolves.toEqual({
      result: 'started',
      status: null,
    });
    const offContract = vi.fn(async () => json({ state: 'running' }, 202));
    await expect(startAgentRun(URL, offContract)).resolves.toEqual({
      result: 'started',
      status: null,
    });
  });

  it('reports an agent that is not serving', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(startAgentRun(URL, fetchImpl)).resolves.toEqual({
      result: 'unreachable',
      status: null,
    });
  });

  it('surfaces any other refusal', async () => {
    const fetchImpl = vi.fn(async () => json({}, 403));
    await expect(startAgentRun(URL, fetchImpl)).rejects.toThrow(
      'Agent trigger failed: 403',
    );
  });
});

describe('runStatusRefetchInterval', () => {
  it('polls every second only while a run is in progress', () => {
    expect(runStatusRefetchInterval(running)).toBe(1_000);
    expect(
      runStatusRefetchInterval(
        agentRunStatus({ state: 'succeeded', finishedAt: 2_000 }),
      ),
    ).toBe(false);
    expect(runStatusRefetchInterval(null)).toBe(false);
    expect(runStatusRefetchInterval(undefined)).toBe(false);
  });
});

describe('isLocalHostname', () => {
  it('accepts only loopback hosts', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('v2.zap-pilot.org')).toBe(false);
  });
});
