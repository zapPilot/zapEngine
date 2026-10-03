import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keccak256, type EIP1193Provider } from 'viem';
import artifact from '@/data/strategy-deployment.json';
import {
  DEPLOYMENT_ADDRESS,
  FACTORY,
  SALT,
  deployStrategy,
} from '../deployment';

const mocks = vi.hoisted(() => ({
  wallet: {
    requestAddresses: vi.fn(),
    switchChain: vi.fn(),
    addChain: vi.fn(),
    getChainId: vi.fn(),
    sendTransaction: vi.fn(),
  },
  client: {
    getChainId: vi.fn(),
    getBytecode: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  },
}));
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createWalletClient: () => mocks.wallet,
}));
vi.mock('../onchain', () => ({ calculatorClient: () => mocks.client }));
const factoryCode =
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';
const hash = `0x${'12'.repeat(32)}` as const;
const provider = { request: vi.fn() } as unknown as EIP1193Provider;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.wallet.requestAddresses.mockResolvedValue([
    '0x1111111111111111111111111111111111111111',
  ]);
  mocks.wallet.switchChain.mockResolvedValue(undefined);
  mocks.wallet.getChainId.mockResolvedValue(421614);
  mocks.client.getChainId.mockResolvedValue(421614);
  mocks.wallet.sendTransaction.mockResolvedValue(hash);
  mocks.client.waitForTransactionReceipt.mockResolvedValue({
    status: 'success',
    blockNumber: 42n,
  });
});
describe('Rabby deterministic deployment', () => {
  it('requires a selected Rabby account', async () => {
    mocks.wallet.requestAddresses.mockResolvedValueOnce([]);
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'Select an account in Rabby',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('adds an unknown Arbitrum Sepolia chain when the wallet reports 4902', async () => {
    mocks.wallet.switchChain
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(undefined);
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(
        (
          await import(
            '../../../../../analytics-engine/tests/fixtures/pinned_strategy/dma_cross_down_slice.json'
          )
        ).runtime_code,
      );
    const deployment = await deployStrategy(provider, vi.fn());
    expect(mocks.wallet.addChain).toHaveBeenCalled();
    expect(deployment.address).toBe(DEPLOYMENT_ADDRESS);
  });
  it('adds the chain when the 4902 code arrives on the error cause', async () => {
    mocks.wallet.switchChain
      .mockRejectedValueOnce({ code: 4001, cause: { code: 4902 } })
      .mockResolvedValueOnce(undefined);
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(
        (
          await import(
            '../../../../../analytics-engine/tests/fixtures/pinned_strategy/dma_cross_down_slice.json'
          )
        ).runtime_code,
      );
    const deployment = await deployStrategy(provider, vi.fn());
    expect(mocks.wallet.addChain).toHaveBeenCalled();
    expect(deployment.address).toBe(DEPLOYMENT_ADDRESS);
  });
  it('rethrows wallet chain errors without the missing-chain code', async () => {
    mocks.wallet.switchChain.mockRejectedValueOnce({ code: 4001 });
    await expect(deployStrategy(provider, vi.fn())).rejects.toMatchObject({
      code: 4001,
    });
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('never broadcasts on the wrong wallet network', async () => {
    mocks.wallet.getChainId.mockResolvedValue(1);
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'Arbitrum Sepolia required',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects an unexpected factory without broadcasting', async () => {
    mocks.client.getBytecode.mockResolvedValue('0x1234');
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'deployer bytecode mismatch',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects a missing factory without broadcasting', async () => {
    mocks.client.getBytecode.mockResolvedValueOnce(undefined);
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'deployer bytecode mismatch',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('rejects the wrong RPC network without broadcasting', async () => {
    mocks.client.getChainId.mockResolvedValueOnce(1);
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'Wrong RPC network',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('does not redeploy an occupied address', async () => {
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce('0x1234');
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'Already deployed',
    );
    expect(mocks.wallet.sendTransaction).not.toHaveBeenCalled();
  });
  it('treats 0x as empty and continues to broadcast', async () => {
    const runtime = (
      await import(
        '../../../../../analytics-engine/tests/fixtures/pinned_strategy/dma_cross_down_slice.json'
      )
    ).runtime_code;
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce('0x')
      .mockResolvedValueOnce(runtime);
    const deployment = await deployStrategy(provider, vi.fn());
    expect(mocks.wallet.sendTransaction).toHaveBeenCalled();
    expect(deployment.address).toBe(DEPLOYMENT_ADDRESS);
  });
  it('retains the transaction hash when deployment reverts', async () => {
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce(undefined);
    mocks.client.waitForTransactionReceipt.mockResolvedValue({
      status: 'reverted',
    });
    const notify = vi.fn();
    await expect(deployStrategy(provider, notify)).rejects.toThrow(
      'Deployment reverted',
    );
    expect(notify).toHaveBeenCalledWith(hash);
  });
  it('sends only the pinned factory calldata and verifies runtime before activation', async () => {
    const original = await import('@/data/strategy-deployment.json');
    // The compiler fixture provides the runtime that matches the pinned artifact.
    const runtime =
      await import('../../../../../analytics-engine/tests/fixtures/pinned_strategy/dma_cross_down_slice.json');
    expect(keccak256(runtime.runtime_code as `0x${string}`)).toBe(
      original.runtimeCodehash,
    );
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(runtime.runtime_code);
    const deployment = await deployStrategy(provider, vi.fn());
    expect(mocks.wallet.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: FACTORY,
        data: `${SALT}${artifact.initcode.slice(2)}`,
        value: 0n,
      }),
    );
    expect(deployment).toMatchObject({
      address: DEPLOYMENT_ADDRESS,
      chainId: 421614,
      blockNumber: '42',
      transactionHash: hash,
      sourcify: { status: 'pending' },
    });
  });
  it('rejects substituted runtime bytecode', async () => {
    mocks.client.getBytecode
      .mockResolvedValueOnce(factoryCode)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('0x1234');
    await expect(deployStrategy(provider, vi.fn())).rejects.toThrow(
      'Runtime codehash mismatch',
    );
  });
});
