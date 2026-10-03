import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
  act,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { EIP1193Provider, Hex } from 'viem';
import { DeployStrategy } from '../DeployStrategy';
import { DEPLOYMENT_ADDRESS } from '@/lib/verifiable-strategy/deployment';

const deployMocks = vi.hoisted(() => ({
  deployStrategy: vi.fn(),
}));
vi.mock('@/lib/verifiable-strategy/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/verifiable-strategy/deployment')
    >();
  return {
    ...actual,
    deployStrategy: deployMocks.deployStrategy,
  };
});

function providerStub(overrides: Partial<Record<string, Mock>> = {}) {
  const on = vi.fn();
  const removeListener = vi.fn();
  const request = vi.fn().mockResolvedValue(['0xabc']);
  const provider = {
    on,
    removeListener,
    request,
    ...overrides,
  } as unknown as EIP1193Provider;
  return { provider, on, removeListener, request };
}

function announce(provider: EIP1193Provider) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { rdns: 'io.rabby' }, provider },
    }),
  );
}

function announceOther(provider: EIP1193Provider) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { rdns: 'io.other' }, provider },
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  deployMocks.deployStrategy.mockImplementation(
    async (_p: EIP1193Provider, onTx: (h: Hex) => void) => {
      const transactionHash = `0x${'11'.repeat(32)}` as Hex;
      onTx(transactionHash);
      return {
        chainId: 421614,
        address: DEPLOYMENT_ADDRESS,
        transactionHash,
        blockNumber: '1',
        runtimeCodehash: `0x${'22'.repeat(32)}` as Hex,
        sourcify: { status: 'pending' as const },
      };
    },
  );
});
afterEach(cleanup);

describe('DeployStrategy Rabby flow', () => {
  it('asks to install Rabby when no provider announces', async () => {
    render(<DeployStrategy onDeployed={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    expect(await screen.findByText(/Rabby not detected/)).toBeInTheDocument();
  });

  it('ignores providers that are not Rabby', async () => {
    const { provider } = providerStub();
    render(<DeployStrategy onDeployed={vi.fn()} />);
    act(() => announceOther(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    expect(await screen.findByText(/Rabby not detected/)).toBeInTheDocument();
  });

  it('connects, handles empty accounts, and surfaces connection errors', async () => {
    const { provider, request } = providerStub();
    render(<DeployStrategy onDeployed={vi.fn()} />);
    act(() => announce(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Rabby connected/);
    expect(screen.getByText(/Connected:/)).toBeInTheDocument();

    request.mockResolvedValueOnce([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Select an account in Rabby/);

    request.mockRejectedValueOnce(new Error('User rejected'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/User rejected/);

    request.mockRejectedValueOnce('denied-string');
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connection rejected/);
  });

  it('resets the account when Rabby disconnects or switches accounts', async () => {
    const { provider, on } = providerStub();
    render(<DeployStrategy onDeployed={vi.fn()} />);
    act(() => announce(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connected:/);
    const reset = on.mock.calls.find(
      ([event]) => event === 'accountsChanged',
    )?.[1] as () => void;
    expect(reset).toBeDefined();
    reset();
    await waitFor(() =>
      expect(screen.queryByText(/Connected:/)).not.toBeInTheDocument(),
    );
    expect(on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('deploys, shows the transaction, and reports success', async () => {
    const { provider } = providerStub();
    const onDeployed = vi.fn();
    render(<DeployStrategy onDeployed={onDeployed} />);
    act(() => announce(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connected:/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
    );
    await screen.findByText(/Deployment transaction:/);
    expect(onDeployed).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/Deployed\. Runtime codehash verified/),
    ).toBeInTheDocument();
    expect(deployMocks.deployStrategy).toHaveBeenCalledWith(
      provider,
      expect.any(Function),
    );
  });

  it('reports deployment failures including non-Error rejections', async () => {
    const { provider } = providerStub();
    render(<DeployStrategy onDeployed={vi.fn()} />);
    act(() => announce(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connected:/);

    deployMocks.deployStrategy.mockRejectedValueOnce(new Error('Out of gas'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
    );
    await screen.findByText(/Out of gas/);

    deployMocks.deployStrategy.mockRejectedValueOnce('boom-string');
    fireEvent.click(
      screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
    );
    await screen.findByText(/Deployment failed/);
  });

  it('updates status while the transaction is submitted', async () => {
    const { provider } = providerStub();
    const tx = `0x${'ab'.repeat(32)}` as Hex;
    deployMocks.deployStrategy.mockImplementationOnce(
      async (_p: EIP1193Provider, onTx: (h: Hex) => void) => {
        onTx(tx);
        return {
          chainId: 421614,
          address: DEPLOYMENT_ADDRESS,
          transactionHash: tx,
          blockNumber: '2',
          runtimeCodehash: `0x${'33'.repeat(32)}`,
          sourcify: { status: 'pending' },
        };
      },
    );
    render(<DeployStrategy onDeployed={vi.fn()} />);
    act(() => announce(provider));
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connected:/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
    );
    expect(
      await screen.findByText(/Deployment transaction:/),
    ).toBeInTheDocument();
  });
});
