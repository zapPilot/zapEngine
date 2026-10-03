import {
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
  act,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyCalculator } from '../StrategyCalculator';
import { dataset, example } from '@/lib/verifiable-strategy/__tests__/fixtures';

const onchainMocks = vi.hoisted(() => ({
  verifyDeployment: vi.fn(),
  runCalculator: vi.fn(),
  calculatorClient: vi.fn(),
}));
vi.mock('@/lib/verifiable-strategy/onchain', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/verifiable-strategy/onchain')>();
  return {
    ...actual,
    verifyDeployment: onchainMocks.verifyDeployment,
    runCalculator: onchainMocks.runCalculator,
    calculatorClient: onchainMocks.calculatorClient,
  };
});

const deployMocks = vi.hoisted(() => ({ deployStrategy: vi.fn() }));
const navState = vi.hoisted(() => ({ query: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => navState.query }));
vi.mock('@/lib/verifiable-strategy/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/lib/verifiable-strategy/deployment')
    >();
  return { ...actual, deployStrategy: deployMocks.deployStrategy };
});

beforeEach(() => {
  vi.resetAllMocks();
  onchainMocks.calculatorClient.mockReturnValue({});
  onchainMocks.verifyDeployment.mockResolvedValue({ blockNumber: 100n });
  onchainMocks.runCalculator.mockRejectedValue(new Error('boom'));
  deployMocks.deployStrategy.mockImplementation(
    async (_p: unknown, onTx: (h: `0x${string}`) => void) => {
      const transactionHash = `0x${'11'.repeat(32)}` as const;
      onTx(transactionHash);
      return {
        chainId: 421614,
        address: '0x1111111111111111111111111111111111111111',
        transactionHash,
        blockNumber: '1',
        runtimeCodehash: `0x${'22'.repeat(32)}`,
        sourcify: { status: 'pending' as const },
      };
    },
  );
});
afterEach(cleanup);

describe('StrategyCalculator verification and run gaps', () => {
  it('shows the verification error when bytecode check fails', async () => {
    onchainMocks.verifyDeployment.mockRejectedValueOnce(
      new Error('No contract bytecode'),
    );
    render(<StrategyCalculator data={dataset} />);
    expect(await screen.findByText(/No contract bytecode/)).toBeInTheDocument();
  });

  it('shows a fallback when verification rejects with non-Error', async () => {
    onchainMocks.verifyDeployment.mockRejectedValueOnce('string-failure');
    render(<StrategyCalculator data={dataset} />);
    expect(
      await screen.findByText(/Bytecode check failed/),
    ).toBeInTheDocument();
  });

  it('ignores a late verification failure after unmount', async () => {
    let reject!: (e: unknown) => void;
    onchainMocks.verifyDeployment.mockReturnValueOnce(
      new Promise((_res, rej) => {
        reject = rej;
      }),
    );
    const { unmount } = render(<StrategyCalculator data={dataset} />);
    unmount();
    await act(async () => {
      reject(new Error('late'));
    });
  });

  it('maps contract errors to the deployment hint', async () => {
    onchainMocks.runCalculator.mockRejectedValueOnce(
      new Error('codehash mismatch'),
    );
    render(<StrategyCalculator data={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
    expect(
      await screen.findByText(/pinned artifact before retrying/),
    ).toBeInTheDocument();
  });

  it('maps network errors to the RPC hint', async () => {
    onchainMocks.runCalculator.mockRejectedValueOnce(new Error('network down'));
    render(<StrategyCalculator data={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
    expect(await screen.findByText(/Arbitrum Sepolia RPC/)).toBeInTheDocument();
  });

  it('maps unknown errors to the connection hint', async () => {
    onchainMocks.runCalculator.mockRejectedValueOnce(
      new Error('something else'),
    );
    render(<StrategyCalculator data={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
    expect(
      await screen.findByText(/Check your connection/),
    ).toBeInTheDocument();
  });

  it('reports RPC failure for non-Error calculation rejections', async () => {
    onchainMocks.runCalculator.mockRejectedValueOnce('string-boom');
    render(<StrategyCalculator data={dataset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Call contract' }));
    expect(
      await screen.findByText(/RPC calculation failed/),
    ).toBeInTheDocument();
  });

  it('deploys from the undeployed state and continues', async () => {
    const undeployed = { ...dataset, deployment: null, examples: [example] };
    render(<StrategyCalculator data={undeployed} />);
    expect(screen.getByText(/Deploy with Rabby/)).toBeInTheDocument();
    const provider = {
      on: vi.fn(),
      removeListener: vi.fn(),
      request: vi.fn().mockResolvedValue(['0xabc']),
    } as never;
    act(() => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.rabby' }, provider },
        }),
      );
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Connect Rabby wallet' }),
    );
    await screen.findByText(/Connected:/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/Deploy with Rabby/)).not.toBeInTheDocument(),
    );
  });
});
