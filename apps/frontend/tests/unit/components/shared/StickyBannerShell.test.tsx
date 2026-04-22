import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StickyBannerShell } from '@/components/layout/banners/StickyBannerShell';

vi.mock('framer-motion', async () => {
  const { setupFramerMotionMocks } =
    await import('../../../utils/framerMotionMocks');

  return setupFramerMotionMocks();
});

// Mock BaseCard used by StickyBannerShell
vi.mock('@/components/ui', () => ({
  BaseCard: ({
    children,
    className,
    borderRadius: _borderRadius,
    padding: _padding,
    variant: _variant,
  }: {
    children: React.ReactNode;
    className?: string;
    borderRadius?: string;
    padding?: string;
    variant?: string;
  }) => (
    <div className={className} data-testid="base-card">
      {children}
    </div>
  ),
}));

// Mock design system constants
vi.mock('@/constants/design-system', () => ({
  HEADER: { TOP_OFFSET: 'top-16' },
  Z_INDEX: { BANNER: 'z-40' },
}));

describe('StickyBannerShell', () => {
  describe('Snapshot Tests - UI Design Freeze', () => {
    it('should match snapshot with default props', () => {
      const { container } = render(
        <StickyBannerShell>
          <span>Banner Content</span>
        </StickyBannerShell>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot with custom className', () => {
      const { container } = render(
        <StickyBannerShell cardClassName="custom-class">
          <span>Custom Content</span>
        </StickyBannerShell>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('should match snapshot with data-testid', () => {
      const { container } = render(
        <StickyBannerShell data-testid="my-banner">
          <span>Test Content</span>
        </StickyBannerShell>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('Behavior Tests', () => {
    it('should render children correctly', () => {
      render(
        <StickyBannerShell>
          <span data-testid="child">Hello</span>
        </StickyBannerShell>,
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should apply data-testid when provided', () => {
      render(
        <StickyBannerShell data-testid="test-banner">
          <span>Content</span>
        </StickyBannerShell>,
      );
      expect(screen.getByTestId('test-banner')).toBeInTheDocument();
    });

    it('should render with BaseCard component', () => {
      render(
        <StickyBannerShell>
          <span>Content</span>
        </StickyBannerShell>,
      );
      expect(screen.getByTestId('base-card')).toBeInTheDocument();
    });

    it('should apply sticky positioning', () => {
      const { container } = render(
        <StickyBannerShell>
          <span>Content</span>
        </StickyBannerShell>,
      );
      expect(container.querySelector('.sticky')).toBeInTheDocument();
    });
  });
});
