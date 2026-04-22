import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GradientButton } from '../../../../src/components/ui/GradientButton';

vi.mock('framer-motion', async () => {
  const { setupFramerMotionMocks } =
    await import('../../../utils/framerMotionMocks');

  return setupFramerMotionMocks();
});

// Mock React.memo to avoid memoization issues in tests
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    memo: vi.fn((component) => component), // Return the component without memoization
  };
});

// Mock icon
const MockIcon = vi.fn(() => <span data-testid="mock-icon">Icon</span>);

describe('GradientButton', () => {
  const defaultProps = {
    gradient: 'from-blue-500 to-purple-500',
  };

  it('should render children correctly', () => {
    render(
      <GradientButton {...defaultProps}>
        <span>Click me</span>
      </GradientButton>,
    );

    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should apply gradient classes', () => {
    render(
      <GradientButton {...defaultProps} testId="gradient-btn">
        Click me
      </GradientButton>,
    );

    const button = screen.getByTestId('gradient-btn');
    expect(button).toHaveClass(
      'bg-gradient-to-r',
      'from-blue-500',
      'to-purple-500',
    );
  });

  it('should call onClick when clicked', () => {
    const mockClick = vi.fn();
    render(
      <GradientButton
        {...defaultProps}
        onClick={mockClick}
        testId="gradient-btn"
      >
        Click me
      </GradientButton>,
    );

    fireEvent.click(screen.getByTestId('gradient-btn'));
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when disabled', () => {
    const mockClick = vi.fn();
    render(
      <GradientButton
        {...defaultProps}
        onClick={mockClick}
        disabled
        testId="gradient-btn"
      >
        Click me
      </GradientButton>,
    );

    fireEvent.click(screen.getByTestId('gradient-btn'));
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('should apply disabled classes when disabled', () => {
    render(
      <GradientButton {...defaultProps} disabled testId="gradient-btn">
        Click me
      </GradientButton>,
    );

    const button = screen.getByTestId('gradient-btn');
    expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    expect(button).toBeDisabled();
  });

  it('should render icon when provided', () => {
    render(
      <GradientButton {...defaultProps} icon={MockIcon} testId="gradient-btn">
        Click me
      </GradientButton>,
    );

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <GradientButton
        {...defaultProps}
        className="custom-class"
        testId="gradient-btn"
      >
        Click me
      </GradientButton>,
    );

    const button = screen.getByTestId('gradient-btn');
    expect(button).toHaveClass('custom-class');
  });

  it('should apply shadow classes when shadowColor is provided', () => {
    render(
      <GradientButton
        {...defaultProps}
        shadowColor="blue-500"
        testId="gradient-btn"
      >
        Click me
      </GradientButton>,
    );

    const button = screen.getByTestId('gradient-btn');
    expect(button).toHaveClass('hover:shadow-lg', 'hover:shadow-blue-500/25');
  });

  it('should set testId when provided', () => {
    render(
      <GradientButton {...defaultProps} testId="custom-test-id">
        Click me
      </GradientButton>,
    );

    expect(screen.getByTestId('custom-test-id')).toBeInTheDocument();
  });
});
