import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';

/**
 * Custom render function that wraps components with common providers.
 * Currently a simple wrapper, but can be extended for context providers.
 */

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  // Add any custom options here as needed
}

/**
 * Wrapper component for tests - can be extended with providers
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * Custom render function with all necessary providers
 * Use this instead of @testing-library/react render for consistent test setup
 */
function customRender(ui: ReactElement, options?: CustomRenderOptions): RenderResult {
  return render(ui, {
    wrapper: TestWrapper,
    ...options,
  });
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override render with custom render
export { customRender as render };

// Export test utilities
export { TestWrapper };
