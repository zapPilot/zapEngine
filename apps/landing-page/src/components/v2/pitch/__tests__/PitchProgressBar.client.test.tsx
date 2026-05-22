import '@testing-library/jest-dom';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { PitchProgressBar } from '../PitchProgressBar.client';

describe('PitchProgressBar.client', () => {
  let rafCalls: FrameRequestCallback[];
  let originalRAF: typeof globalThis.requestAnimationFrame;
  let originalCAF: typeof globalThis.cancelAnimationFrame;

  beforeEach(() => {
    rafCalls = [];
    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
      rafCalls.push(cb);
      return rafCalls.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
  });

  it('renders a progressbar role', () => {
    const { getByRole } = render(<PitchProgressBar />);
    const bar = getByRole('progressbar');
    expect(bar).toHaveClass('pitch-progress');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('updates aria-valuenow after a scroll event', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 500,
    });

    const { getByRole } = render(<PitchProgressBar />);

    // Initial scroll fires + the post-mount call drained the queue; run any
    // pending rAF callbacks to apply the scroll progress to state.
    act(() => {
      for (const cb of rafCalls.splice(0)) cb(0);
    });

    fireEvent.scroll(window);
    act(() => {
      for (const cb of rafCalls.splice(0)) cb(0);
    });

    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('treats a zero-height page as 0% progress', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });

    const { getByRole } = render(<PitchProgressBar />);
    act(() => {
      for (const cb of rafCalls.splice(0)) cb(0);
    });

    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('cancels a pending frame on unmount', () => {
    const { unmount } = render(<PitchProgressBar />);
    // Don't drain the queue — leave a pending callback so unmount has work.
    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('clamps over-scrolled values to 100%', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1100,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      // Mobile bounce or programmatic overscroll → scrollY > max. The
      // component must clamp to 100 (Math.min branch).
      value: 500,
    });

    const { getByRole } = render(<PitchProgressBar />);
    act(() => {
      for (const cb of rafCalls.splice(0)) cb(0);
    });

    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
