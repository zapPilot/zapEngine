import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroCockpit } from '@/components/landing-v2/HeroCockpit';

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(100);
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: false,
  } as MediaQueryList);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function amount() {
  return screen.getByText(/\$[\d,.]+/, { selector: '.zp-cockpit-networth' })
    .textContent;
}

describe('HeroCockpit', () => {
  it('counts up, clamps early frames, completes, and rotates weights', () => {
    const { container, unmount } = render(<HeroCockpit />);
    expect(amount()).toContain('$0.00');
    act(() => frames.shift()?.(0));
    expect(amount()).toContain('$0.00');
    act(() => frames.shift()?.(800));
    expect(amount()).not.toContain('$0.00');
    act(() => frames.shift()?.(10_000));
    expect(amount()).toContain('$128,540.22');
    expect(container.querySelector('.zp-alloc-bar span')).toHaveStyle({
      width: '42%',
    });
    act(() => vi.advanceTimersByTime(8_000));
    expect(container.querySelector('.zp-alloc-bar span')).toHaveStyle({
      width: '36%',
    });
    act(() => vi.advanceTimersByTime(16_000));
    expect(container.querySelector('.zp-alloc-bar span')).toHaveStyle({
      width: '42%',
    });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('keeps the final value for reduced motion', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);
    render(<HeroCockpit />);
    expect(amount()).toContain('$128,540.22');
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps the final value when requestAnimationFrame is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    render(<HeroCockpit />);
    expect(amount()).toContain('$128,540.22');
  });
});
