// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useWalletManager,
  type WalletManager,
} from '@/integration/useWalletManager';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  equalsAddress: vi.fn(),
  labelsArgs: null as null | Record<string, unknown>,
  listArgs: null as null | Record<string, unknown>,
  mutationArgs: null as null | Record<string, unknown>,
  provider: null as null | {
    connect: ReturnType<typeof vi.fn>;
    signMessage: ReturnType<typeof vi.fn>;
  },
  cancellation: vi.fn((error: unknown) =>
    Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'login_flow_closed',
    ),
  ),
  loadWallets: vi.fn(),
  setWallets: vi.fn(),
  handleAddWallet: vi.fn(),
  handleVerifyWallet: vi.fn(),
  handleDeleteWallet: vi.fn(),
  handleEditLabel: vi.fn(),
}));

vi.mock('@zapengine/types/shared', () => ({
  equalsAddress: mocks.equalsAddress,
}));
vi.mock('@/integration/nativePrivyLogin', () => ({
  isPrivyLoginCancellation: mocks.cancellation,
}));
vi.mock('@zapengine/app-core/providers/walletContext', () => ({
  useWalletProvider: () => mocks.provider,
}));
vi.mock('@zapengine/app-core/hooks/wallet/useWalletList', () => ({
  useWalletList: (args: Record<string, unknown>) => {
    mocks.listArgs = args;
    return {
      wallets: [{ id: 'wallet-1', wallet_address: '0xabc', label: null }],
      isRefreshing: true,
      loadWallets: mocks.loadWallets,
      setWallets: mocks.setWallets,
    };
  },
}));
vi.mock('@zapengine/app-core/hooks/wallet/useWalletMutations', () => ({
  useWalletMutations: (args: Record<string, unknown>) => {
    mocks.mutationArgs = args;
    return {
      handleAddWallet: mocks.handleAddWallet,
      addingState: { isLoading: false, error: null },
      handleVerifyWallet: mocks.handleVerifyWallet,
      verifyingState: { 'wallet-1': { isLoading: true, error: null } },
      handleDeleteWallet: mocks.handleDeleteWallet,
    };
  },
}));
vi.mock('@zapengine/app-core/hooks/wallet/useWalletLabels', () => ({
  useWalletLabels: (args: Record<string, unknown>) => {
    mocks.labelsArgs = args;
    return { handleEditLabel: mocks.handleEditLabel };
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  current(): WalletManager;
  root: Root;
  container: HTMLDivElement;
}

let active: Harness | null = null;

function Probe({
  userId,
  address,
  onValue,
}: {
  userId: string | null;
  address: string | null;
  onValue: (value: WalletManager) => void;
}): ReactElement | null {
  onValue(useWalletManager(userId, address));
  return null;
}

async function render(
  userId: string | null,
  address: string | null,
): Promise<Harness> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let value: WalletManager | null = null;
  await act(async () => {
    root.render(
      createElement(Probe, {
        userId,
        address,
        onValue: (next) => (value = next),
      }),
    );
  });
  active = {
    root,
    container,
    current: () => {
      if (!value) throw new Error('wallet manager did not render');
      return value;
    },
  };
  return active;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.provider = { connect: mocks.connect, signMessage: vi.fn() };
  mocks.loadWallets.mockResolvedValue(undefined);
  mocks.handleVerifyWallet.mockResolvedValue({ success: true });
  mocks.equalsAddress.mockReturnValue(false);
  mocks.connect.mockResolvedValue(undefined);
  active = null;
});

afterEach(async () => {
  if (!active) return;
  await act(async () => active?.root.unmount());
  active.container.remove();
  active = null;
});

describe('useWalletManager', () => {
  it('maps the active wallet, delegates handlers, and reloads without an event argument', async () => {
    const harness = await render('user-1', '0xabc');

    expect(mocks.listArgs).toEqual({
      userId: 'user-1',
      connectedWallets: [{ address: '0xabc', isActive: true }],
      isOpen: true,
      isOwner: true,
    });
    expect(mocks.mutationArgs).toMatchObject({
      userId: 'user-1',
      signingAddress: '0xabc',
      loadWallets: mocks.loadWallets,
    });
    expect(mocks.labelsArgs).toMatchObject({ userId: 'user-1' });
    expect(harness.current()).toMatchObject({
      isRefreshing: true,
      addWallet: mocks.handleAddWallet,
      deleteWallet: mocks.handleDeleteWallet,
      saveLabel: mocks.handleEditLabel,
      verifying: { 'wallet-1': { isLoading: true, error: null } },
    });

    await act(async () => harness.current().reload());
    expect(mocks.loadWallets).toHaveBeenCalledWith();
  });

  it('uses empty user and connected-wallet inputs while logged out', async () => {
    await render(null, null);
    expect(mocks.listArgs).toMatchObject({
      userId: null,
      connectedWallets: [],
    });
    expect(mocks.mutationArgs).toMatchObject({
      userId: '',
      signingAddress: null,
    });
    expect(mocks.labelsArgs).toMatchObject({ userId: '' });
  });

  it('verifies immediately when the selected address already matches', async () => {
    mocks.equalsAddress.mockReturnValue(true);
    const harness = await render('user-1', '0xabc');

    await expect(harness.current().verifyWallet('0xABC')).resolves.toEqual({
      success: true,
    });
    expect(mocks.handleVerifyWallet).toHaveBeenCalledWith('0xABC');
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('connects a non-selected address and asks for an explicit second verification', async () => {
    const harness = await render('user-1', '0xabc');
    await expect(harness.current().verifyWallet('0xdef')).resolves.toEqual({
      success: false,
      error: 'Select this wallet, then tap Verify again.',
    });
    expect(mocks.connect).toHaveBeenCalledOnce();
  });

  it('normalizes Privy cancellation without surfacing it as a wallet failure', async () => {
    mocks.connect.mockRejectedValue(
      Object.assign(new Error('closed'), { code: 'login_flow_closed' }),
    );
    const harness = await render('user-1', '0xabc');

    await expect(harness.current().verifyWallet('0xdef')).resolves.toEqual({
      success: false,
      error: 'Select this wallet, then tap Verify again.',
    });
  });

  it.each([
    [new Error('network down'), 'network down'],
    ['plain failure', 'plain failure'],
  ])(
    'returns an ordinary connect rejection as data',
    async (failure, message) => {
      mocks.connect.mockRejectedValue(failure);
      const harness = await render('user-1', '0xabc');

      await expect(harness.current().verifyWallet('0xdef')).resolves.toEqual({
        success: false,
        error: message,
      });
    },
  );

  it('keys operation updates without losing sibling operation buckets', async () => {
    await render('user-1', '0xabc');
    const setter = mocks.mutationArgs?.['setWalletOperationState'] as (
      key: string,
      id: string,
      state: { isLoading: boolean; error: string | null },
    ) => void;

    await act(async () =>
      setter('removing', 'wallet-1', { isLoading: true, error: null }),
    );

    expect(mocks.mutationArgs?.['operations']).toMatchObject({
      adding: { isLoading: false, error: null },
      removing: { 'wallet-1': { isLoading: true, error: null } },
      editing: {},
      verifying: {},
      subscribing: { isLoading: false, error: null },
    });
  });
});
