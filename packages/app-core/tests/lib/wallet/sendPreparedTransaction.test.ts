import { sendPreparedTransaction } from '@core/lib/wallet/sendPreparedTransaction';
import { describe, expect, it, vi } from 'vitest';

describe('sendPreparedTransaction', () => {
  it('converts prepared decimal value and gas strings to bigint before sending', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('0xabc');
    const transaction = {
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      value: '123456789012345678',
      chainId: 8453,
      gasLimit: '21000',
    } as Parameters<typeof sendPreparedTransaction>[1];

    await expect(
      sendPreparedTransaction({ sendTransaction }, transaction),
    ).resolves.toBe('0xabc');

    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledWith({
      to: '0x1111111111111111111111111111111111111111',
      data: '0x1234',
      value: 123456789012345678n,
      chainId: 8453,
      gas: 21000n,
    });
  });

  it('omits gas when the prepared transaction has no gas limit', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('0xdef');
    const transaction = {
      to: '0x2222222222222222222222222222222222222222',
      data: '0x',
      value: '0',
      chainId: 42161,
    } as Parameters<typeof sendPreparedTransaction>[1];

    await sendPreparedTransaction({ sendTransaction }, transaction);

    expect(sendTransaction).toHaveBeenCalledWith({
      to: '0x2222222222222222222222222222222222222222',
      data: '0x',
      value: 0n,
      chainId: 42161,
    });
  });

  it('preserves an explicit zero gas limit instead of treating it as absent', async () => {
    const sendTransaction = vi.fn().mockResolvedValue('0xzero');
    const transaction = {
      to: '0x2222222222222222222222222222222222222222',
      data: '0x',
      value: '0',
      chainId: 42161,
      gasLimit: '0',
    } as Parameters<typeof sendPreparedTransaction>[1];

    await sendPreparedTransaction({ sendTransaction }, transaction);

    expect(sendTransaction).toHaveBeenCalledWith({
      to: '0x2222222222222222222222222222222222222222',
      data: '0x',
      value: 0n,
      chainId: 42161,
      gas: 0n,
    });
  });

  it('propagates wallet transaction failures unchanged', async () => {
    const failure = new Error('wallet rejected transaction');
    const sendTransaction = vi.fn().mockRejectedValue(failure);
    const transaction = {
      to: '0x3333333333333333333333333333333333333333',
      data: '0xabcd',
      value: '1',
      chainId: 1,
    } as Parameters<typeof sendPreparedTransaction>[1];

    await expect(
      sendPreparedTransaction({ sendTransaction }, transaction),
    ).rejects.toBe(failure);

    expect(sendTransaction).toHaveBeenCalledOnce();
  });

  it('rejects malformed prepared numeric values before calling the wallet', () => {
    const sendTransaction = vi.fn();
    const transaction = {
      to: '0x4444444444444444444444444444444444444444',
      data: '0x',
      value: '1.5',
      chainId: 8453,
    } as Parameters<typeof sendPreparedTransaction>[1];

    expect(() =>
      sendPreparedTransaction({ sendTransaction }, transaction),
    ).toThrow(SyntaxError);

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('rejects malformed prepared gas limits before calling the wallet', () => {
    const sendTransaction = vi.fn();
    const transaction = {
      to: '0x5555555555555555555555555555555555555555',
      data: '0x',
      value: '1',
      chainId: 8453,
      gasLimit: '21000.5',
    } as Parameters<typeof sendPreparedTransaction>[1];

    expect(() =>
      sendPreparedTransaction({ sendTransaction }, transaction),
    ).toThrow(SyntaxError);

    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
