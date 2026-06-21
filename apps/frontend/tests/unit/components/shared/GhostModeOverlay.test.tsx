/**
 * GhostModeOverlay Component Tests
 *
 * Tests for the Ghost Mode blur overlay including:
 * - Conditional rendering based on enabled prop
 * - CTA visibility controlled by showCTA prop
 * - Blur effect application
 * - Preview badge display
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GhostModeOverlay } from '@/components/layout/overlays/GhostModeOverlay';

// Mock wallet dependencies to avoid Privy imports in unit tests
vi.mock('@/components/WalletManager/components/CreateZapWalletButton', () => ({
  CreateZapWalletButton: () => (
    <button data-testid="create-zap-wallet-button">Create Zap Wallet</button>
  ),
}));

describe('GhostModeOverlay', () => {
  const testContent = <div data-testid="test-content">Test Content</div>;

  describe('Snapshot Tests - UI Design Freeze', () => {
    it('should match snapshot when disabled', () => {
      const { container } = render(
        <GhostModeOverlay enabled={false}>{testContent}</GhostModeOverlay>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot when enabled with CTA', () => {
      const { container } = render(
        <GhostModeOverlay enabled={true}>{testContent}</GhostModeOverlay>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot when enabled without CTA', () => {
      const { container } = render(
        <GhostModeOverlay enabled={true} showCTA={false}>
          {testContent}
        </GhostModeOverlay>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('when disabled', () => {
    it('renders children without blur or overlay', () => {
      render(
        <GhostModeOverlay enabled={false}>{testContent}</GhostModeOverlay>,
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('create-zap-wallet-button'),
      ).not.toBeInTheDocument();
    });

    it('does not apply blur classes when disabled', () => {
      const { container } = render(
        <GhostModeOverlay enabled={false}>{testContent}</GhostModeOverlay>,
      );

      expect(
        container.querySelector('.blur-\\[2px\\]'),
      ).not.toBeInTheDocument();
    });
  });

  describe('when enabled', () => {
    it('renders children with blur effect', () => {
      const { container } = render(
        <GhostModeOverlay enabled={true}>{testContent}</GhostModeOverlay>,
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
      expect(container.querySelector('.blur-\\[2px\\]')).toBeInTheDocument();
    });

    it('shows Preview badge', () => {
      render(<GhostModeOverlay enabled={true}>{testContent}</GhostModeOverlay>);

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('shows Create Zap Wallet button by default', () => {
      render(<GhostModeOverlay enabled={true}>{testContent}</GhostModeOverlay>);

      expect(
        screen.getByTestId('create-zap-wallet-button'),
      ).toBeInTheDocument();
    });

    it('applies pointer-events-none to blurred content', () => {
      const { container } = render(
        <GhostModeOverlay enabled={true}>{testContent}</GhostModeOverlay>,
      );

      expect(
        container.querySelector('.pointer-events-none'),
      ).toBeInTheDocument();
    });
  });

  describe('showCTA prop', () => {
    it('hides Create Zap Wallet button when showCTA is false', () => {
      render(
        <GhostModeOverlay enabled={true} showCTA={false}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(screen.getByTestId('test-content')).toBeInTheDocument();
      expect(
        screen.queryByTestId('create-zap-wallet-button'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
    });

    it('still applies blur when showCTA is false', () => {
      const { container } = render(
        <GhostModeOverlay enabled={true} showCTA={false}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(container.querySelector('.blur-\\[2px\\]')).toBeInTheDocument();
    });

    it('shows Create Zap Wallet button by default (showCTA=true)', () => {
      render(
        <GhostModeOverlay enabled={true} showCTA={true}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(
        screen.getByTestId('create-zap-wallet-button'),
      ).toBeInTheDocument();
    });
  });

  /**
   * Wallet Connection State Scenarios
   *
   * These tests document the expected behavior of GhostModeOverlay
   * in different wallet connection states. The `enabled` prop should be:
   * - true: when wallet disconnected (unifiedData === null) or empty portfolio
   * - false: when wallet connected with portfolio data
   *
   * This is controlled by DashboardShell's isEmptyState calculation.
   */
  describe('Wallet State Scenarios (behavior documentation)', () => {
    it('scenario: disconnected wallet should show blur + Create Zap Wallet CTA', () => {
      // When wallet is disconnected, isEmptyState=true in DashboardShell
      // So GhostModeOverlay receives enabled=true
      render(
        <GhostModeOverlay enabled={true} showCTA={true}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(
        screen.getByTestId('create-zap-wallet-button'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('test-content')).toBeInTheDocument();
    });

    it('scenario: connected wallet with data should show content normally', () => {
      // When wallet is connected with data, isEmptyState=false in DashboardShell
      // So GhostModeOverlay receives enabled=false
      render(
        <GhostModeOverlay enabled={false} showCTA={true}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('create-zap-wallet-button'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('test-content')).toBeInTheDocument();
    });

    it('scenario: connected wallet with empty portfolio should show blur + CTA', () => {
      // When wallet is connected but portfolio is empty, isEmptyState=true
      render(
        <GhostModeOverlay enabled={true} showCTA={true}>
          {testContent}
        </GhostModeOverlay>,
      );

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('scenario: bundle URL viewing (visitor mode) should show blur without CTA', () => {
      // When viewing someone else's bundle, showCTA=false to avoid duplicate CTAs
      // isEmptyState=true for empty bundle, but no CTA since it's visitor mode
      render(
        <GhostModeOverlay enabled={true} showCTA={false}>
          {testContent}
        </GhostModeOverlay>,
      );

      // Still blurred but no CTA
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('create-zap-wallet-button'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('test-content')).toBeInTheDocument();
    });
  });
});
