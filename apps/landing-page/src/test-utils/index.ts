/**
 * Test utilities barrel export
 * Import from '@/test-utils' for all testing helpers
 */

// Custom render with providers
export * from './render';

// Window mocking utilities
export * from './mocks/window';

// Router mocks
export * from './mocks/next-router';

// Re-export common testing utilities
export { waitFor, within, screen, act } from '@testing-library/react';

// Note: Framer Motion is mocked globally in jest.setup.js
// No need to import it in individual test files
