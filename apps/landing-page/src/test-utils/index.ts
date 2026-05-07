/**
 * Test utilities barrel export
 * Import from '@/test-utils' for all testing helpers
 */

// Custom render with providers
export * from './render';

// Window mocking utilities
export * from './mocks/window';

// Re-export common testing utilities
export { waitFor, within, screen, act } from '@testing-library/react';

// Note: next/image is mocked globally in vitest.setup.ts
// No need to import them in individual test files
