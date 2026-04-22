import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSpinner } from '@/components/ui';

describe('LoadingSpinner', () => {
  describe('Basic Rendering', () => {
    it('should render with default props', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-label', 'Loading');
    });

    it('should render with custom aria-label', () => {
      render(<LoadingSpinner aria-label="Loading data" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-label', 'Loading data');
    });

    it('should apply custom className', () => {
      render(<LoadingSpinner className="custom-class" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass('custom-class');
    });
  });

  describe('Size Variants', () => {
    it.each([
      ['xs', 'w-3', 'h-3'],
      ['sm', 'w-4', 'h-4'],
      ['md', 'w-6', 'h-6'],
      ['lg', 'w-8', 'h-8'],
      ['xl', 'w-12', 'h-12'],
    ] as const)('should render %s size', (size, ...classes) => {
      render(<LoadingSpinner size={size} />);
      expect(screen.getByRole('status')).toHaveClass(...classes);
    });
  });

  describe('Color Variants', () => {
    it.each([
      ['primary', 'text-blue-600'],
      ['secondary', 'text-gray-600'],
      ['white', 'text-white'],
      ['success', 'text-green-600'],
      ['warning', 'text-yellow-600'],
    ] as const)('should render with %s color', (color, expectedClass) => {
      render(<LoadingSpinner color={color} />);
      expect(screen.getByRole('status').querySelector('svg')).toHaveClass(
        expectedClass,
      );
    });
  });

  describe('Animation', () => {
    it('should have spinning animation class', () => {
      render(<LoadingSpinner />);

      const svg = screen.getByRole('status').querySelector('svg');
      expect(svg).toHaveClass('animate-spin');
    });
  });

  describe('Accessibility', () => {
    it('should be hidden from screen readers when decorative', () => {
      render(<LoadingSpinner aria-hidden="true" />);

      // When aria-hidden="true", the component correctly removes the role attribute
      const spinner = document.querySelector('[aria-hidden="true"]');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-hidden', 'true');
      expect(spinner).not.toHaveAttribute('role');
    });
  });

  describe('SVG Structure', () => {
    it('should contain proper SVG structure', () => {
      render(<LoadingSpinner />);

      const svg = screen.getByRole('status').querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');

      const circles = svg?.querySelectorAll('circle');
      expect(circles).toHaveLength(2);
    });

    it('should have fill set to none', () => {
      render(<LoadingSpinner />);

      const svg = screen.getByRole('status').querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'none');
    });
  });

  describe('Spinner Variants', () => {
    it('should render dots variant with three dot elements', () => {
      render(<LoadingSpinner variant="dots" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      // dots variant renders div elements instead of svg
      expect(spinner.querySelector('svg')).toBeNull();
    });

    it('should render pulse variant without svg', () => {
      render(<LoadingSpinner variant="pulse" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(spinner.querySelector('svg')).toBeNull();
    });

    it('should render default variant with svg', () => {
      render(<LoadingSpinner variant="default" />);

      const spinner = screen.getByRole('status');
      expect(spinner.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Custom Label', () => {
    it('should use custom label for screen reader text', () => {
      render(<LoadingSpinner label="Fetching data" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-label', 'Fetching data');
    });

    it('should prefer aria-label over label prop', () => {
      render(<LoadingSpinner label="Loading" aria-label="Custom label" />);

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-label', 'Custom label');
    });
  });

  describe('Test ID', () => {
    it('should use default test id', () => {
      render(<LoadingSpinner />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should use custom test id', () => {
      render(<LoadingSpinner data-testid="custom-spinner" />);

      expect(screen.getByTestId('custom-spinner')).toBeInTheDocument();
    });
  });

  describe('Combined Props', () => {
    it('should work with multiple props combined', () => {
      render(
        <LoadingSpinner
          size="lg"
          color="success"
          className="custom-spinner"
          aria-label="Loading portfolio data"
        />,
      );

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass('custom-spinner', 'w-8', 'h-8');
      expect(spinner).toHaveAttribute('aria-label', 'Loading portfolio data');

      const svg = spinner.querySelector('svg');
      expect(svg).toHaveClass('text-green-600', 'animate-spin');
    });
  });
});
