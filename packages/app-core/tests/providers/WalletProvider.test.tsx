// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import type { WalletProviderInterface } from '@core/types';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SimulationPreviewRenderProps } from '../../src/providers/WalletProvider';
import type { WalletLoginContextValue } from '../../src/providers/walletLoginContext';

function stubBackend(
  overrides: Partial<WalletProviderInterface> = {},
): WalletProviderInterface {
  return {
    account: null,
    chain: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchChain: vi.fn(),
    sendTransaction: vi.fn(),
    getWalletClient: vi.fn(),
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
    isConnected: false,
    isConnecting: false,
    isDisconnecting: false,
    error: null,
    clearError: vi.fn(),
    connectedWallets: [],
    switchActiveWallet: vi.fn(),
    hasMultipleWallets: false,
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  wagmi: {
    backend: undefined as unknown as WalletProviderInterface,
    isConnected: false,
    connectors: [] as unknown[],
    connectInjected: vi.fn(),
    connectWalletConnect: vi.fn(),
    isWalletConnectAvailable: false,
  },
  privy: {
    backend: undefined as unknown as WalletProviderInterface,
    isActive: false,
    simulationPreview: null as null | { status: string },
    confirmBatchExecution: vi.fn(),
    retryBatchSimulation: vi.fn(),
    updateApprovalAmount: vi.fn(),
    cancelBatchExecution: vi.fn(),
    isSigningAndSending: false,
    batchExecutionPhase: 'idle',
    isRetryingSimulation: false,
    retryError: null,
  },
}));

vi.mock('@core/hooks/wallet/useWagmiWalletBackend', () => ({
  useWagmiWalletBackend: () => mocks.wagmi,
}));
vi.mock('@core/hooks/wallet/usePrivyWalletBackend', () => ({
  usePrivyWalletBackend: () => mocks.privy,
}));

let WalletProvider: typeof import('@core/providers/WalletProvider').WalletProvider;
let useWalletProvider: typeof import('@core/providers/walletContext').useWalletProvider;
let useWalletLogin: typeof import('@core/providers/walletLoginContext').useWalletLogin;

function Capture({
  onValue,
}: {
  onValue: (v: {
    wallet: WalletProviderInterface;
    login: WalletLoginContextValue;
  }) => void;
}) {
  onValue({ wallet: useWalletProvider(), login: useWalletLogin() });
  return null;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.wagmi.connectInjected.mockReset();
  mocks.wagmi.connectInjected.mockResolvedValue(false);
  mocks.wagmi.backend = stubBackend();
  mocks.wagmi.isConnected = false;
  mocks.privy.backend = stubBackend();
  mocks.privy.isActive = false;
  mocks.privy.simulationPreview = null;
  mocks.privy.isSigningAndSending = false;
  mocks.privy.batchExecutionPhase = 'idle';
  mocks.privy.isRetryingSimulation = false;
  mocks.privy.retryError = null;

  ({ WalletProvider } = await import('@core/providers/WalletProvider'));
  ({ useWalletProvider } = await import('@core/providers/walletContext'));
  ({ useWalletLogin } = await import('@core/providers/walletLoginContext'));
});

function renderAndCapture() {
  let captured:
    | { wallet: WalletProviderInterface; login: WalletLoginContextValue }
    | undefined;
  renderToString(
    <WalletProvider>
      <Capture
        onValue={(v) => {
          captured = v;
        }}
      />
    </WalletProvider>,
  );
  if (!captured) throw new Error('WalletProvider did not render children');
  return captured;
}

function renderClientAndCapture() {
  let captured:
    | { wallet: WalletProviderInterface; login: WalletLoginContextValue }
    | undefined;
  const rendered = render(
    <WalletProvider>
      <Capture
        onValue={(v) => {
          captured = v;
        }}
      />
    </WalletProvider>,
  );
  return {
    get value() {
      if (!captured) throw new Error('WalletProvider did not render children');
      return captured;
    },
    unmount: rendered.unmount,
  };
}

describe('WalletProvider (unified)', () => {
  it('defaults to the wagmi backend when neither wallet is connected', () => {
    mocks.wagmi.backend = stubBackend({
      account: { address: '0xwagmi', isConnected: false },
    });
    const { wallet } = renderAndCapture();
    expect(wallet.account?.address).toBe('0xwagmi');
  });

  it('prefers Privy when only Privy is authenticated', () => {
    mocks.privy.isActive = true;
    mocks.privy.backend = stubBackend({
      account: { address: '0xprivy', isConnected: true },
      isConnected: true,
    });
    const { wallet } = renderAndCapture();
    expect(wallet.account?.address).toBe('0xprivy');
    expect(wallet.isConnected).toBe(true);
  });

  it('prefers wagmi over Privy when an external wallet is connected', () => {
    mocks.wagmi.isConnected = true;
    mocks.wagmi.backend = stubBackend({
      isConnected: true,
      account: { address: '0xabc', isConnected: true },
    });
    mocks.privy.isActive = true;
    mocks.privy.backend = stubBackend({ isConnected: true });
    const { wallet } = renderAndCapture();
    expect(wallet.account?.address).toBe('0xabc');
  });

  it('overrides connect() to open the custom picker instead of calling either backend directly', async () => {
    const { wallet, login } = renderAndCapture();
    expect(login.isPickerOpen).toBe(false);

    await wallet.connect();

    expect(mocks.wagmi.backend.connect).not.toHaveBeenCalled();
    expect(mocks.privy.backend.connect).not.toHaveBeenCalled();
  });

  it('exposes unified busy state through both wallet and login contexts', () => {
    mocks.wagmi.backend = stubBackend({ isConnecting: true });
    const { wallet, login } = renderAndCapture();

    expect(wallet.isConnecting).toBe(true);
    expect(login.isConnecting).toBe(true);
  });

  it('closes the picker when injected connection resolves true', async () => {
    mocks.wagmi.connectInjected.mockResolvedValue(true);
    const rendered = renderClientAndCapture();

    await act(async () => {
      rendered.value.login.openPicker();
    });
    expect(rendered.value.login.isPickerOpen).toBe(true);

    await act(async () => {
      await rendered.value.login.connectInjected('com.ambire');
    });

    expect(rendered.value.login.isPickerOpen).toBe(false);
    rendered.unmount();
  });

  it('keeps the picker open when injected connection resolves false', async () => {
    mocks.wagmi.connectInjected.mockResolvedValue(false);
    const rendered = renderClientAndCapture();

    await act(async () => {
      rendered.value.login.openPicker();
    });
    await act(async () => {
      await rendered.value.login.connectInjected('com.ambire');
    });

    expect(rendered.value.login.isPickerOpen).toBe(true);
    rendered.unmount();
  });

  it('disconnect() clears both backends when both are connected', async () => {
    mocks.wagmi.isConnected = true;
    mocks.wagmi.backend = stubBackend({ isConnected: true });
    mocks.privy.isActive = true;
    mocks.privy.backend = stubBackend({ isConnected: true });
    const { wallet } = renderAndCapture();

    await wallet.disconnect();

    expect(mocks.wagmi.backend.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.privy.backend.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnect() does not call disconnect on a backend that was never connected', async () => {
    mocks.wagmi.isConnected = true;
    mocks.wagmi.backend = stubBackend({ isConnected: true });
    mocks.privy.isActive = false;
    const { wallet } = renderAndCapture();

    await wallet.disconnect();

    expect(mocks.wagmi.backend.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.privy.backend.disconnect).not.toHaveBeenCalled();
  });

  it('still renders the Privy simulation preview via renderSimulationPreview', () => {
    mocks.privy.simulationPreview = { status: 'passed' };
    mocks.privy.isSigningAndSending = true;
    mocks.privy.batchExecutionPhase = 'authorizingBatch';
    mocks.privy.isRetryingSimulation = true;
    mocks.privy.retryError = 'retry failed';
    let renderedProps: SimulationPreviewRenderProps | undefined;
    renderToString(
      <WalletProvider
        renderSimulationPreview={(props) => {
          renderedProps = props;
          return null;
        }}
      >
        <span />
      </WalletProvider>,
    );
    expect(renderedProps).toMatchObject({
      isOpen: true,
      previewData: { status: 'passed' },
      onClose: mocks.privy.cancelBatchExecution,
      onConfirm: mocks.privy.confirmBatchExecution,
      onRetry: mocks.privy.retryBatchSimulation,
      onUpdateApproval: mocks.privy.updateApprovalAmount,
      isSigningAndSending: true,
      batchExecutionPhase: 'authorizingBatch',
      isRetryingSimulation: true,
      retryError: 'retry failed',
    });
  });

  it('does not invoke renderSimulationPreview while no batch is pending', () => {
    mocks.privy.simulationPreview = null;
    const renderPreview = vi.fn(() => null);
    renderToString(
      <WalletProvider renderSimulationPreview={renderPreview}>
        <span />
      </WalletProvider>,
    );
    expect(renderPreview).not.toHaveBeenCalled();
  });
});
