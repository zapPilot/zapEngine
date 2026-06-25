import { render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BundleProviders } from '@/app/bundle/BundleProviders';

const envMocks = vi.hoisted(() => ({
  getRuntimeEnv: vi.fn(() => undefined as string | undefined),
}));

// Mock all providers to keep tests focused on BundleProviders composition
vi.mock('@zapengine/app-core/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}));

vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="wallet-provider">{children}</div>
  ),
}));

vi.mock('@zapengine/app-core/providers/PrivyAuthProvider', () => ({
  PrivyAuthProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="privy-auth-provider">{children}</div>
  ),
}));

vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

vi.mock('@/components/errors/GlobalErrorHandler', () => ({
  GlobalErrorHandler: () => (
    <div data-testid="global-error-handler">Error Handler</div>
  ),
}));

vi.mock('@/providers/ToastProvider', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
}));

// Resolve the deferred ToastProvider synchronously while keeping lazy-only
// development widgets out of these composition tests.
vi.mock('@/lib/lazy/lazyImport', () => ({
  lazyImport: <TProps,>(
    _loader: () => Promise<unknown>,
    selectExport: (module: unknown) => ComponentType<TProps>,
  ) =>
    selectExport({
      ToastProvider: ({ children }: { children: ReactNode }) => (
        <div data-testid="toast-provider">{children}</div>
      ),
    }),
}));

// Mock env to control shouldLoadLogViewer
vi.mock('@zapengine/app-core/lib/env/runtimeEnv', () => ({
  isRuntimeMode: () => false,
  getRuntimeEnv: envMocks.getRuntimeEnv,
}));

describe('BundleProviders', () => {
  beforeEach(() => {
    envMocks.getRuntimeEnv.mockReturnValue(undefined);
  });

  it('throws when VITE_PRIVY_APP_ID is missing', () => {
    expect(() =>
      render(
        <BundleProviders>
          <div>Child</div>
        </BundleProviders>,
      ),
    ).toThrow(
      'Missing required VITE_PRIVY_APP_ID for Privy wallet configuration.',
    );
  });

  it('renders children inside providers when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div data-testid="child-content">Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('wraps content with QueryProvider when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('query-provider')).toBeInTheDocument();
  });

  it('uses PrivyAuthProvider and WalletProvider when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('privy-auth-provider')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-provider')).toBeInTheDocument();
  });

  it('wraps content with ToastProvider when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('toast-provider')).toBeInTheDocument();
  });

  it('includes ErrorBoundary when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
  });

  it('includes GlobalErrorHandler when Privy is configured', () => {
    envMocks.getRuntimeEnv.mockImplementation((key: string) =>
      key === 'VITE_PRIVY_APP_ID' ? 'privy-app-id' : undefined,
    );

    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('global-error-handler')).toBeInTheDocument();
  });
});
