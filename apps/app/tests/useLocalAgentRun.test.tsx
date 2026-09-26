// @vitest-environment jsdom
import type { AgentRunStatus } from '@zapengine/types/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocalAgentRun } from '@/components/aiWallet/useLocalAgentRun';
import { AGENT_ADDRESS } from '@/config/aiWalletDemo';

import { agentRunStatus } from './support/agentRunStatus';

const showToast = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('@zapengine/app-core/providers/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const idle = agentRunStatus({ state: 'idle', startedAt: null });
const running = agentRunStatus({ activeStep: 'news' });

type Handler = (method: string) => Promise<Response> | Response;
let handler: Handler;
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
  handler(init?.method ?? 'GET'),
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

let hook: ReturnType<typeof useLocalAgentRun>;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useLocalAgentRun>) => void;
}) {
  const value = useLocalAgentRun();
  useEffect(() => onValue(value));
  return null;
}

async function mount() {
  // Mutations retry by default in the app; the hook must opt out itself.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: 3, retryDelay: 0 } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={queryClient}>
        <Probe
          onValue={(value) => {
            hook = value;
          }}
        />
      </QueryClientProvider>,
    );
  });
  return queryClient;
}

async function until(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  handler = () => json(idle);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  fetchMock.mockClear();
  showToast.mockClear();
  vi.unstubAllGlobals();
});

describe('useLocalAgentRun', () => {
  it('is available on a local web host and loads the agent status', async () => {
    await mount();
    await until(() => expect(hook.run).toEqual(idle));
    expect(hook).toMatchObject({ available: true, phase: 'idle' });
  });

  it('sends POST /runs exactly once when the trigger fails', async () => {
    await mount();
    await until(() => expect(hook.run).toEqual(idle));
    handler = (method) => (method === 'POST' ? json({}, 500) : json(idle));
    await act(async () => hook.start());
    await until(() =>
      expect(showToast).toHaveBeenCalledWith({
        type: 'error',
        title: 'Agent trigger failed: 500',
      }),
    );
    expect(posts()).toHaveLength(1);
    expect(hook.phase).toBe('idle');
  });

  it('shows the accepted run at once, over an older status request', async () => {
    const queryClient = await mount();
    await until(() => expect(hook.run).toEqual(idle));

    let answerStale!: () => void;
    handler = (method) =>
      method === 'POST'
        ? json(running, 202)
        : new Promise((resolve) => {
            answerStale = () => resolve(json(idle));
          });
    void queryClient.refetchQueries();
    await until(() => expect(answerStale).toBeTypeOf('function'));
    await act(async () => hook.start());
    await until(() => expect(hook.phase).toBe('running'));
    await act(async () => answerStale());
    await until(() => expect(queryClient.isFetching()).toBe(0));
    expect(hook.run).toEqual(running);
    expect(posts()).toHaveLength(1);
  });

  it('applies the status of a run already in progress', async () => {
    await mount();
    await until(() => expect(hook.run).toEqual(idle));
    handler = (method) =>
      method === 'POST' ? json(running, 409) : json(running);
    await act(async () => hook.start());
    await until(() => expect(hook.phase).toBe('running'));
    expect(showToast).toHaveBeenCalledWith({
      type: 'info',
      title: 'A run is already in progress',
    });
  });

  it('asks for `pnpm agent serve` when nothing is listening', async () => {
    handler = () => {
      throw new TypeError('Failed to fetch');
    };
    await mount();
    await until(() => expect(fetchMock).toHaveBeenCalled());
    expect(hook.run).toBeNull();
    await act(async () => hook.start());
    await until(() =>
      expect(showToast).toHaveBeenCalledWith({
        type: 'error',
        title: 'Start `pnpm agent serve` first',
      }),
    );
  });

  it('clears the run and warns when the agent stops mid-run', async () => {
    handler = () => json(running);
    const queryClient = await mount();
    await until(() => expect(hook.phase).toBe('running'));
    handler = () => {
      throw new TypeError('Failed to fetch');
    };
    await act(async () => queryClient.refetchQueries());
    await until(() => expect(hook.run).toBeNull());
    expect(hook.phase).toBe('idle');
    expect(showToast).toHaveBeenCalledWith({
      type: 'error',
      title:
        'Agent stopped mid-run — check the terminal and Basescan before running again',
    });
  });

  it('warns when a restarted agent reports another run', async () => {
    handler = () => json(running);
    const queryClient = await mount();
    await until(() => expect(hook.phase).toBe('running'));
    const restarted: AgentRunStatus = { ...running, startedAt: 9_000 };
    handler = () => json(restarted);
    await act(async () => queryClient.refetchQueries());
    await until(() => expect(hook.run).toEqual(restarted));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('refreshes the Blockscout activity once the run succeeds', async () => {
    handler = () => json(running);
    const queryClient = await mount();
    await until(() => expect(hook.phase).toBe('running'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const succeeded = agentRunStatus({
      state: 'succeeded',
      finishedAt: 2_000,
    });
    handler = () => json(succeeded);
    await act(async () => queryClient.refetchQueries());
    await until(() => expect(hook.run).toEqual(succeeded));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['ai-wallet', 'transactions', AGENT_ADDRESS],
    });
    expect(showToast).not.toHaveBeenCalled();
    expect(hook.phase).toBe('idle');
  });
});
