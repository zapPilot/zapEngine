/**
 * SimpleWeb3Provider Unit Tests
 *
 * Tests for the wagmi WagmiProvider wrapper
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SimpleWeb3Provider } from '@/providers/SimpleWeb3Provider';

// Mock wagmi
vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wagmi-provider">{children}</div>
  ),
}));

vi.mock('@/config/wagmi', () => ({
  wagmiConfig: {},
}));

describe('SimpleWeb3Provider', () => {
  it('should render children', () => {
    render(
      <SimpleWeb3Provider>
        <div data-testid="child">Web3 Content</div>
      </SimpleWeb3Provider>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Web3 Content')).toBeInTheDocument();
  });

  it('should wrap children with WagmiProvider', () => {
    render(
      <SimpleWeb3Provider>
        <span>Content</span>
      </SimpleWeb3Provider>,
    );

    expect(screen.getByTestId('wagmi-provider')).toBeInTheDocument();
  });
});
