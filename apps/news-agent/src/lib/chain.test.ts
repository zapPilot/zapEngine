import { beforeEach, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getTransactionCount: vi.fn(),
  estimateGas: vi.fn(),
  estimateFeesPerGas: vi.fn(),
  getTransactionReceipt: vi.fn(),
}));
vi.mock('viem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem')>()),
  createPublicClient: vi.fn(() => client),
}));
import { TransactionReceiptNotFoundError } from 'viem';

import { deposit, hash, wallet } from '../test-utils/fixtures.js';
import { createChain } from './chain.js';
beforeEach(() => {
  vi.clearAllMocks();
  client.getChainId.mockResolvedValue(8453);
  client.getTransactionCount.mockResolvedValue(7);
  client.estimateGas.mockResolvedValue(101n);
  client.estimateFeesPerGas.mockResolvedValue({
    maxFeePerGas: 10n,
    maxPriorityFeePerGas: 1n,
  });
});
it('checks chain and preserves plan fields while adding nonce, gas and fees', async () => {
  const chain = createChain('https://rpc.example');
  await chain.assertChain();
  expect(await chain.nonce(wallet, 'pending')).toBe(7);
  const tx = deposit();
  expect(await chain.prepare(tx, wallet, 7)).toMatchObject({
    to: tx.to,
    data: tx.data,
    value: tx.value,
    nonce: 7,
    gas: 122,
    type: 2,
    gasFeeCap: '10',
    gasTipCap: '1',
  });
  expect((await chain.prepare({ ...tx, gasLimit: '200' }, wallet, 8)).gas).toBe(
    200,
  );
  client.getChainId.mockResolvedValue(1);
  await expect(chain.assertChain()).rejects.toThrow('Base mainnet');
  await chain.nonce(wallet, 'latest');
  expect(client.getTransactionCount).toHaveBeenLastCalledWith({
    address: wallet,
    blockTag: 'latest',
  });
});
it('rejects unsafe gas and RPC failures before submit', async () => {
  const chain = createChain('https://rpc.example');
  await expect(
    chain.prepare({ ...deposit(), gasLimit: '9007199254740992' }, wallet, 7),
  ).rejects.toThrow('safe integer');
  client.estimateGas.mockRejectedValue(new Error('revert'));
  await expect(chain.prepare(deposit(), wallet, 7)).rejects.toThrow('revert');
});
it('reads receipt status and treats a missing receipt as not yet known', async () => {
  const chain = createChain('https://rpc.example');
  client.getTransactionReceipt.mockResolvedValueOnce({ status: 'reverted' });
  expect(await chain.receipt(hash as `0x${string}`)).toBe('reverted');
  client.getTransactionReceipt.mockRejectedValueOnce(
    new TransactionReceiptNotFoundError({ hash: hash as `0x${string}` }),
  );
  expect(await chain.receipt(hash as `0x${string}`)).toBeNull();
  client.getTransactionReceipt.mockRejectedValueOnce(new Error('rpc down'));
  await expect(chain.receipt(hash as `0x${string}`)).rejects.toThrow(
    'rpc down',
  );
});
