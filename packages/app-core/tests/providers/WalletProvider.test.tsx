import type { WalletProviderInterface } from '@core/types';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  mocks.wagmi.backend = stubBackend();
  mocks.wagmi.isConnected = false;
  mocks.privy.backend = stubBackend();
  mocks.privy.isActive = false;
  mocks.privy.simulationPreview = null;

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

describe('WalletProvider (unified)', () => {
  it('defaults to the wagmi backend when neither wallet is connected', () => {
    const { login } = renderAndCapture();
    expect(login.activeMethod).toBeNull();
  });

  it('prefers Privy when only Privy is authenticated', () => {
    mocks.privy.isActive = true;
    mocks.privy.backend = stubBackend({ isConnected: true });
    const { wallet, login } = renderAndCapture();
    expect(login.activeMethod).toBe('privy');
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
    const { wallet, login } = renderAndCapture();
    expect(login.activeMethod).toBe('wagmi');
    expect(wallet.account?.address).toBe('0xabc');
  });

  it('overrides connect() to open the custom picker instead of calling either backend directly', async () => {
    const { wallet, login } = renderAndCapture();
    expect(login.isPickerOpen).toBe(false);

    await wallet.connect();

    expect(mocks.wagmi.backend.connect).not.toHaveBeenCalled();
    expect(mocks.privy.backend.connect).not.toHaveBeenCalled();
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
    let renderedStatus: string | undefined;
    renderToString(
      <WalletProvider
        renderSimulationPreview={(props) => {
          renderedStatus = (props.previewData as { status: string }).status;
          return null;
        }}
      >
        <span />
      </WalletProvider>,
    );
    expect(renderedStatus).toBe('passed');
  });
});
