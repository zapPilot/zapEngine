import {
  EIP7702_DELEGATES,
  inspectDelegation,
} from '@zapengine/app-core/lib/wallet/eip7702Delegation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicClient: vi.fn(),
  getCode: vi.fn(),
}));

vi.mock('@zapengine/app-core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

const accountAddress = '0x1111111111111111111111111111111111111111';
const unknownDelegate = '0x4444444444444444444444444444444444444444';

function delegatedCode(implementation: string): `0x${string}` {
  return `0xef0100${implementation.slice(2)}` as `0x${string}`;
}

describe('inspectDelegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicClient.mockReturnValue({
      getCode: mocks.getCode,
    });
  });

  it('treats missing code as an undelegated EOA', async () => {
    mocks.getCode.mockResolvedValue(undefined);

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'notDelegated',
      compatibility: 'none',
    });
    expect(mocks.getPublicClient).toHaveBeenCalledWith(8453);
    expect(mocks.getCode).toHaveBeenCalledWith({ address: accountAddress });
  });

  it('treats empty code as an undelegated EOA', async () => {
    mocks.getCode.mockResolvedValue('0x');

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'notDelegated',
      compatibility: 'none',
    });
  });

  it('ignores ordinary contract bytecode without the EIP-7702 prefix', async () => {
    mocks.getCode.mockResolvedValue('0x6080604052348015600e575f80fd');

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'notDelegated',
      compatibility: 'none',
    });
  });

  it('ignores malformed EIP-7702 delegation bytecode', async () => {
    mocks.getCode.mockResolvedValue('0xef0100deadbeef');

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'notDelegated',
      compatibility: 'none',
    });
  });

  it('recognizes the Ambire delegate as supported', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(EIP7702_DELEGATES.ambire));

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'delegated',
      implementation: EIP7702_DELEGATES.ambire,
      label: 'Ambire EIP-7702 Delegator',
      compatibility: 'supported',
    });
  });

  it('recognizes the OKX delegate as supported', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(EIP7702_DELEGATES.okx));

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'delegated',
      implementation: EIP7702_DELEGATES.okx,
      label: 'OKX EIP-7702 Delegator',
      compatibility: 'supported',
    });
  });

  it('recognizes the MetaMask delegate as incompatible', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(EIP7702_DELEGATES.metamask));

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'delegated',
      implementation: EIP7702_DELEGATES.metamask,
      label: 'MetaMask EIP-7702 Delegator',
      compatibility: 'unsupported',
    });
  });

  it('keeps unknown delegates compatible but explicit', async () => {
    mocks.getCode.mockResolvedValue(`0xEF0100${unknownDelegate.slice(2)}`);

    await expect(
      inspectDelegation({ address: accountAddress, chainId: 8453 }),
    ).resolves.toEqual({
      kind: 'delegated',
      implementation: unknownDelegate,
      label: 'Unknown EIP-7702 implementation',
      compatibility: 'unknown',
    });
  });
});
