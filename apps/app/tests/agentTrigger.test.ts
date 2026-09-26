import { describe, expect, it, vi } from 'vitest';

import { isLocalHostname, startAgentRun } from '@/integration/agentTrigger';

const URL = 'http://127.0.0.1:8787';

describe('startAgentRun', () => {
  it('posts the trigger header and reports a started run', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 202 }));
    await expect(startAgentRun(URL, fetchImpl)).resolves.toBe('started');
    expect(fetchImpl).toHaveBeenCalledWith(`${URL}/runs`, {
      method: 'POST',
      headers: { 'x-zap-trigger': '1' },
    });
  });

  it('reports a run already in progress', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 409 }));
    await expect(startAgentRun(URL, fetchImpl)).resolves.toBe('busy');
  });

  it('reports an agent that is not serving', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(startAgentRun(URL, fetchImpl)).resolves.toBe('unreachable');
  });

  it('surfaces any other refusal', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));
    await expect(startAgentRun(URL, fetchImpl)).rejects.toThrow(
      'Agent trigger failed: 403',
    );
  });
});

describe('isLocalHostname', () => {
  it('accepts only loopback hosts', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('v2.zap-pilot.org')).toBe(false);
  });
});
