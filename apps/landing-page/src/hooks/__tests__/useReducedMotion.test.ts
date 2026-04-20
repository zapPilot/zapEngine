import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  let mockMatchMedia: Mock;

  beforeEach(() => {
    mockMatchMedia = vi.fn();
    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial prefers-reduced-motion value', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should return false when reduced motion is not preferred', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should update when preference changes', () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn((event, handler) => {
        listener = handler;
      }),
      removeEventListener: vi.fn(),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it('should clean up listener on unmount', () => {
    const removeEventListener = vi.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });

  it('should handle fallback for older browsers with addListener', () => {
    const removeListener = vi.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addListener: vi.fn(),
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
