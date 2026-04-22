import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  useAppPathname,
  useAppRouter,
  useAppSearchParams,
} from '@/lib/routing/appRouter';

function createWrapper(
  initialEntries: string[] = ['/'],
): ({ children }: { children: ReactNode }) => JSX.Element {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
  Wrapper.displayName = 'TestRouter';
  return Wrapper;
}

describe('useAppRouter', () => {
  it('returns an object with push and replace methods', () => {
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.push).toBe('function');
    expect(typeof result.current.replace).toBe('function');
  });

  it('push navigates to the given href', () => {
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(['/start']),
    });

    // Should not throw
    expect(() =>
      result.current.push('/new-path', { scroll: false }),
    ).not.toThrow();
  });

  it('replace navigates to the given href', () => {
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(['/start']),
    });

    expect(() =>
      result.current.replace('/replaced-path', { scroll: false }),
    ).not.toThrow();
  });

  it('push with scroll=true calls window.scrollTo', () => {
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(),
    });

    result.current.push('/test');

    expect(scrollSpy).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
    scrollSpy.mockRestore();
  });

  it('push with scroll=false does not call window.scrollTo', () => {
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(),
    });

    result.current.push('/test', { scroll: false });

    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('replace with scroll=false does not call window.scrollTo', () => {
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(),
    });

    result.current.replace('/test', { scroll: false });

    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it('replace without scroll option calls window.scrollTo', () => {
    const scrollSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const { result } = renderHook(() => useAppRouter(), {
      wrapper: createWrapper(),
    });

    result.current.replace('/test');

    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});

describe('useAppPathname', () => {
  it('returns the current pathname', () => {
    const { result } = renderHook(() => useAppPathname(), {
      wrapper: createWrapper(['/bundle']),
    });

    expect(result.current).toBe('/bundle');
  });

  it('returns / for root path', () => {
    const { result } = renderHook(() => useAppPathname(), {
      wrapper: createWrapper(['/']),
    });

    expect(result.current).toBe('/');
  });
});

describe('useAppSearchParams', () => {
  it('returns URLSearchParams instance', () => {
    const { result } = renderHook(() => useAppSearchParams(), {
      wrapper: createWrapper(['/bundle?userId=0xabc']),
    });

    expect(result.current).toBeInstanceOf(URLSearchParams);
  });

  it('parses search params from the URL', () => {
    const { result } = renderHook(() => useAppSearchParams(), {
      wrapper: createWrapper(['/bundle?userId=0xabc&tab=analytics']),
    });

    expect(result.current.get('userId')).toBe('0xabc');
    expect(result.current.get('tab')).toBe('analytics');
  });

  it('returns empty URLSearchParams when no query string', () => {
    const { result } = renderHook(() => useAppSearchParams(), {
      wrapper: createWrapper(['/bundle']),
    });

    expect(result.current.toString()).toBe('');
  });
});
