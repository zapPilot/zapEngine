import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

describe('useMediaQuery', () => {
  let mockMatchMedia: jest.Mock;

  beforeEach(() => {
    mockMatchMedia = jest.fn();
    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return initial matches value', () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('should return false when media query does not match', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);
  });

  it('should update when media query changes', () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null;

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn((event, handler) => {
        listener = handler;
      }),
      removeEventListener: jest.fn(),
    });

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(result.current).toBe(true);
  });

  it('should clean up event listener on unmount', () => {
    const removeEventListener = jest.fn();

    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener,
    });

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    unmount();

    expect(removeEventListener).toHaveBeenCalled();
  });

  it('should update query when changed', () => {
    mockMatchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    });

    expect(result.current).toBe(false);

    // Change query
    rerender({ query: '(min-width: 1024px)' });

    // Should call matchMedia with new query
    expect(mockMatchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
  });
});
