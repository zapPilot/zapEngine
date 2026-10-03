import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeployStrategy } from '../DeployStrategy';
import { DEPLOYMENT_ADDRESS } from '@/lib/verifiable-strategy/deployment';

vi.mock('@/lib/verifiable-strategy/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/verifiable-strategy/deployment')
    >();
  return {
    ...actual,
    deployStrategy: vi.fn(),
  };
});

import { deployStrategy } from '@/lib/verifiable-strategy/deployment';

const deployMock = vi.mocked(deployStrategy);

function provider(overrides: Record<string, unknown> = {}) {
  return {
    request: vi.fn().mockResolvedValue(['0xabc']),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as Parameters<typeof deployStrategy>[0];
}

function announce(p: unknown) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { rdns: 'io.rabby' }, provider: p },
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(cleanup);

it('shows the deterministic address and warns without a wallet', async () => {
  const onDeployed = vi.fn();
  render(<DeployStrategy onDeployed={onDeployed} />);
  expect(screen.getByText(/Deterministic address/)).toBeInTheDocument();
  expect(screen.getByText(DEPLOYMENT_ADDRESS)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  expect(await screen.findByText(/Rabby not detected/)).toBeInTheDocument();
  expect(onDeployed).not.toHaveBeenCalled();
});

it('connects through an announced Rabby provider and resets on account change', async () => {
  const onDeployed = vi.fn();
  const p = provider();
  render(<DeployStrategy onDeployed={onDeployed} />);
  act(() => {
    announce(p);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  expect(await screen.findByText(/Connected:/)).toBeInTheDocument();
  expect(screen.getByText(/Arbitrum Sepolia test ETH/)).toBeInTheDocument();
  const onHandler = vi.mocked(p.on as unknown as (...args: unknown[]) => void);
  const reset = onHandler.mock.calls.find(
    (call) => call[0] === 'accountsChanged',
  )?.[1] as () => void;
  expect(reset).toBeDefined();
  act(() => {
    reset();
  });
  expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument();
});

it('asks to select an account when the wallet returns none', async () => {
  const onDeployed = vi.fn();
  const p = provider({ request: vi.fn().mockResolvedValue([]) });
  render(<DeployStrategy onDeployed={onDeployed} />);
  act(() => {
    announce(p);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  expect(
    await screen.findByText(/Select an account in Rabby/),
  ).toBeInTheDocument();
});

it('surfaces connection rejections', async () => {
  const onDeployed = vi.fn();
  const p = provider({
    request: vi.fn().mockRejectedValue(new Error('User rejected')),
  });
  render(<DeployStrategy onDeployed={onDeployed} />);
  act(() => {
    announce(p);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  expect(await screen.findByText('User rejected')).toBeInTheDocument();
});

it('deploys, reports the transaction, and notifies the parent', async () => {
  const onDeployed = vi.fn();
  const p = provider();
  const deployment = {
    chainId: 421614,
    address: DEPLOYMENT_ADDRESS,
    transactionHash: `0x${'33'.repeat(32)}`,
    blockNumber: '7',
    runtimeCodehash: '0xabc',
    sourcify: { status: 'pending' },
  };
  deployMock.mockImplementation(async (_provider, onTransaction) => {
    onTransaction(deployment.transactionHash as `0x${string}`);
    return deployment as unknown as Awaited<ReturnType<typeof deployStrategy>>;
  });
  render(<DeployStrategy onDeployed={onDeployed} />);
  act(() => {
    announce(p);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  await screen.findByText(/Connected:/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
  );
  expect(
    await screen.findByText(/Deployment transaction:/),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/Runtime codehash verified/),
  ).toBeInTheDocument();
  expect(onDeployed).toHaveBeenCalledWith(deployment);
  expect(
    screen.getByText(/uv run python -m scripts.pinned_strategy.deploy/),
  ).toBeInTheDocument();
});

it('surfaces deployment failures without notifying the parent', async () => {
  const onDeployed = vi.fn();
  const p = provider();
  deployMock.mockRejectedValue(new Error('Deployment reverted'));
  render(<DeployStrategy onDeployed={onDeployed} />);
  act(() => {
    announce(p);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  await screen.findByText(/Connected:/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
  );
  expect(await screen.findByText('Deployment reverted')).toBeInTheDocument();
  expect(onDeployed).not.toHaveBeenCalled();
});
