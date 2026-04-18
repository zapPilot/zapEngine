import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  let mockMatchMedia: jest.Mock;

  beforeEach(() => {
    mockMatchMedia = jest.fn();
    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return initial prefers-reduced-motion value', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should return false when reduced motion is not preferred', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should update when preference changes', () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn((event, handler) => {
        listener = handler;
      }),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it('should clean up listener on unmount', () => {
    const removeEventListener = jest.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });

  it('should handle fallback for older browsers with addListener', () => {
    const removeListener = jest.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener,
    });

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeListener).toHaveBeenCalled();
  });

  it('should handle missing matchMedia gracefully', () => {
    const originalMatchMedia = window.matchMedia;
    // @ts-expect-error - intentionally setting undefined for test
    window.matchMedia = undefined;

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Restore
    window.matchMedia = originalMatchMedia;
  });
});
