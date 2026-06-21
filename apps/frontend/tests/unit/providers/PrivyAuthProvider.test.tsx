import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivyAuthProvider } from '@/providers/PrivyAuthProvider';

const privyMocks = vi.hoisted(() => ({
  getPrivyAppId: vi.fn(() => undefined as string | undefined),
}));

vi.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({
    children,
    appId,
  }: {
    children: React.ReactNode;
    appId: string;
  }) => (
    <div data-testid="privy-provider" data-app-id={appId}>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/env/privy', () => ({
  getPrivyAppId: () => privyMocks.getPrivyAppId(),
}));

describe('PrivyAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when no app ID is configured', () => {
    privyMocks.getPrivyAppId.mockReturnValue(undefined);

    expect(() =>
      render(
        <PrivyAuthProvider>
          <div data-testid="child">Content</div>
        </PrivyAuthProvider>,
      ),
    ).toThrow(
      'Missing required VITE_PRIVY_APP_ID for Privy wallet configuration.',
    );
  });

  it('renders children wrapped in PrivyProvider when app ID is set', () => {
    privyMocks.getPrivyAppId.mockReturnValue('test-privy-app-id');

    render(
      <PrivyAuthProvider>
        <div data-testid="child">Content</div>
      </PrivyAuthProvider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('privy-provider')).toBeInTheDocument();
    expect(screen.getByTestId('privy-provider')).toHaveAttribute(
      'data-app-id',
      'test-privy-app-id',
    );
  });

  it('passes the app ID from getPrivyAppId to PrivyProvider', () => {
    privyMocks.getPrivyAppId.mockReturnValue('cm-privy-id-123');

    render(
      <PrivyAuthProvider>
        <div>Content</div>
      </PrivyAuthProvider>,
    );

    expect(screen.getByTestId('privy-provider')).toHaveAttribute(
      'data-app-id',
      'cm-privy-id-123',
    );
  });
});
