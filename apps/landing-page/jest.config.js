/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
        },
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(framer-motion|lucide-react)/)'],

  // Coverage configuration
  collectCoverage: false, // Enable via --coverage flag
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/app/**', // Next.js app router files (mostly routing)
    '!src/types/**', // Type definitions
    '!src/**/index.ts', // Barrel exports
    '!src/test-utils/**', // Test utilities
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 60,
      functions: 60,
      lines: 65,
    },
    // Critical business logic - higher thresholds
    './src/lib/regimeUtils.ts': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
    './src/lib/regimeTransformers.ts': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85,
    },
    // Hooks with comprehensive testing
    './src/hooks/useMediaQuery.ts': {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
    './src/hooks/useReducedMotion.ts': {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
    './src/hooks/useRegimeAutoPlay.ts': {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },
};

module.exports = config;
