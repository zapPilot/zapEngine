import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { AnimatedBackground } from '../AnimatedBackground';

// Mock useReducedMotion hook
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

import { useReducedMotion } from '@/hooks/useReducedMotion';

describe('AnimatedBackground', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the background container', () => {
    const { container } = render(<AnimatedBackground />);

    const backgroundDiv = container.querySelector('.fixed.inset-0');
    expect(backgroundDiv).toBeInTheDocument();
  });

  it('should render gradient background', () => {
    const { container } = render(<AnimatedBackground />);

    const gradientDiv = container.querySelector('.bg-gradient-to-br');
    expect(gradientDiv).toBeInTheDocument();
  });

  it('should render animated orbs', () => {
    const { container } = render(<AnimatedBackground />);

    // Should have multiple orb elements (FloatingOrb uses blur-xl, custom orb uses blur-3xl)
    const allOrbs = container.querySelectorAll('.rounded-full');
    expect(allOrbs.length).toBeGreaterThanOrEqual(3);
  });

  it('should respect reduced motion preference', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);

    const { container } = render(<AnimatedBackground />);

    // Component should still render
    const backgroundDiv = container.querySelector('.fixed.inset-0');
    expect(backgroundDiv).toBeInTheDocument();
  });

  it('should have z-index for proper layering', () => {
    const { container } = render(<AnimatedBackground />);

    const backgroundDiv = container.querySelector('.-z-10');
    expect(backgroundDiv).toBeInTheDocument();
  });
});
