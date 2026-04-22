import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BundleProviders } from '@/app/bundle/BundleProviders';

// Mock all providers to keep tests focused on BundleProviders composition
vi.mock('@/providers/QueryProvider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}));

vi.mock('@/providers/SimpleWeb3Provider', () => ({
  SimpleWeb3Provider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="web3-provider">{children}</div>
  ),
}));

vi.mock('@/providers/WalletProvider', () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wallet-provider">{children}</div>
  ),
}));

vi.mock('@/contexts/UserContext', () => ({
  UserProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-provider">{children}</div>
  ),
}));

vi.mock('@/components/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

vi.mock('@/components/errors/GlobalErrorHandler', () => ({
  GlobalErrorHandler: () => (
    <div data-testid="global-error-handler">Error Handler</div>
  ),
}));

vi.mock('@/providers/ToastProvider', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
}));

// Mock lazyImport so LogViewer doesn't trigger lazy loading
vi.mock('@/lib/lazy/lazyImport', () => ({
  lazyImport: () => () => null,
}));

// Mock env to control shouldLoadLogViewer
vi.mock('@/lib/env/runtimeEnv', () => ({
  isRuntimeMode: () => false,
  getRuntimeEnv: () => undefined,
}));

describe('BundleProviders', () => {
  it('renders children inside providers', () => {
    render(
      <BundleProviders>
        <div data-testid="child-content">Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('wraps content with QueryProvider', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('query-provider')).toBeInTheDocument();
  });

  it('wraps content with WalletProvider', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('wallet-provider')).toBeInTheDocument();
  });

  it('wraps content with ToastProvider', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('toast-provider')).toBeInTheDocument();
  });

  it('includes ErrorBoundary', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
  });

  it('includes GlobalErrorHandler', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('global-error-handler')).toBeInTheDocument();
  });

  it('includes UserProvider', () => {
    render(
      <BundleProviders>
        <div>Child</div>
      </BundleProviders>,
    );

    expect(screen.getByTestId('user-provider')).toBeInTheDocument();
  });
});
