/**
 * Window property mocking utilities for tests
 * Provides consistent, type-safe helpers for mocking window properties
 *
 * @example
 * import { setupWindowMock } from '@/test-utils';
 *
 * describe('MyComponent', () => {
 *   it('handles window.open', () => {
 *     const mockOpen = setupWindowMock.open();
 *     // ... test code
 *     expect(mockOpen).toHaveBeenCalled();
 *   });
 * });
 */

/**
 * Controller for window.scrollY mock
 */
export interface ScrollYController {
  set: (value: number) => void;
  get: () => number;
}

/**
 * Controller for window.innerWidth mock
 */
export interface InnerWidthController {
  set: (value: number) => void;
}

/**
 * Window property mocking utilities
 */
export const setupWindowMock = {
  /**
   * Mock window.open for testing external link navigation
   * @returns Mock function that can be inspected with jest matchers
   *
   * @example
   * const mockOpen = setupWindowMock.open();
   * fireEvent.click(button);
   * expect(mockOpen).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
   */
  open: (): jest.Mock => {
    const mockWindowOpen = jest.fn();
    Object.defineProperty(window, 'open', {
      writable: true,
      value: mockWindowOpen,
    });
    return mockWindowOpen;
  },

  /**
   * Mock window.scrollY for testing scroll behavior
   * @param initialValue Starting scroll position (default: 0)
   * @returns Controller with set() and get() methods
   *
   * @example
   * const scroll = setupWindowMock.scrollY(0);
   *
   * act(() => {
   *   scroll.set(100);
   *   window.dispatchEvent(new Event('scroll'));
   * });
   *
   * expect(scroll.get()).toBe(100);
   */
  scrollY: (initialValue = 0): ScrollYController => {
    let mockScrollY = initialValue;
    Object.defineProperty(window, 'scrollY', {
      get: () => mockScrollY,
      configurable: true,
    });
    return {
      set: (value: number) => {
        mockScrollY = value;
      },
      get: () => mockScrollY,
    };
  },

  /**
   * Mock window.innerWidth for testing responsive behavior
   * @param initialValue Starting width in pixels (default: 1024)
   * @returns Controller with set() method
   *
   * @example
   * const width = setupWindowMock.innerWidth(500);
   *
   * width.set(1200);
   * window.dispatchEvent(new Event('resize'));
   *
   * // Component should now render desktop layout
   */
  innerWidth: (initialValue = 1024): InnerWidthController => {
    const setWidth = (value: number) => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value,
      });
    };
    setWidth(initialValue);
    return { set: setWidth };
  },

  /**
   * Mock window.matchMedia for testing media query hooks
   * @param query The media query string
   * @param matches Whether the query should match
   * @returns Mock MediaQueryList object
   *
   * @example
   * setupWindowMock.matchMedia('(max-width: 768px)', true);
   * // Now media queries will return matches: true
   */
  matchMedia: (query: string, matches = false) => {
    const mockMatchMedia = jest.fn().mockImplementation((q: string) => ({
      matches: q === query ? matches : false,
      media: q,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });

    return mockMatchMedia;
  },
};
