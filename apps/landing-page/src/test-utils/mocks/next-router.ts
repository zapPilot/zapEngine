/**
 * Next.js router mock for testing components that use navigation.
 * Compatible with Next.js 13+ App Router.
 */

/**
 * Mock router object with common properties and methods
 */
export const mockRouter = {
  // App Router properties
  push: jest.fn().mockResolvedValue(true),
  replace: jest.fn().mockResolvedValue(true),
  prefetch: jest.fn().mockResolvedValue(undefined),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),

  // Current route state
  pathname: '/',
  route: '/',
  query: {},
  asPath: '/',
  basePath: '',
  locale: undefined,
  locales: undefined,
  defaultLocale: undefined,
  isReady: true,
  isPreview: false,
  isFallback: false,

  // Events (Pages Router compatibility)
  events: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },

  // Legacy methods
  beforePopState: jest.fn(),
};

/**
 * Mock useRouter hook
 */
function useRouter() {
  return mockRouter;
}

/**
 * Mock usePathname hook (App Router)
 */
function usePathname() {
  return mockRouter.pathname;
}

/**
 * Mock useSearchParams hook (App Router)
 */
function useSearchParams() {
  return new URLSearchParams();
}

/**
 * Mock useParams hook (App Router)
 */
function useParams() {
  return {};
}

/**
 * Mock useSelectedLayoutSegment hook (App Router)
 */
function useSelectedLayoutSegment() {
  return null;
}

/**
 * Mock useSelectedLayoutSegments hook (App Router)
 */
function useSelectedLayoutSegments() {
  return [];
}
