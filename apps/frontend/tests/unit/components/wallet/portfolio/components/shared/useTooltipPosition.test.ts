import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTooltipPosition } from '@/components/wallet/portfolio/components/shared/useTooltipPosition';

describe('useTooltipPosition', () => {
  type MockRect = Pick<
    DOMRect,
    'top' | 'bottom' | 'left' | 'right' | 'width' | 'height' | 'x' | 'y'
  > & {
    toJSON: () => object;
  };

  function createRef<T>(current: T | null) {
    return { current };
  }

  function mockElementRect(
    element: HTMLElement,
    rectOrFactory: MockRect | (() => MockRect),
  ) {
    const getRect =
      typeof rectOrFactory === 'function' ? rectOrFactory : () => rectOrFactory;

    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn((): DOMRect => getRect() as DOMRect),
    });
  }

  function renderTooltipPosition(
    isHovered: boolean,
    containerCurrent: HTMLElement | null,
    tooltipCurrent: HTMLElement | null,
  ) {
    const containerRef = createRef(containerCurrent);
    const tooltipRef = createRef(tooltipCurrent);

    return renderHook(() =>
      useTooltipPosition(isHovered, containerRef, tooltipRef),
    );
  }

  it('returns default position when not hovered', () => {
    const { result } = renderTooltipPosition(
      false,
      document.createElement('div'),
      document.createElement('div'),
    );
    expect(result.current).toEqual({ top: 0, left: 0 });
  });

  it('returns default position when containerRef is null', () => {
    const { result } = renderTooltipPosition(
      true,
      null,
      document.createElement('div'),
    );
    expect(result.current).toEqual({ top: 0, left: 0 });
  });

  it('returns default position when tooltipRef is null', () => {
    const { result } = renderTooltipPosition(
      true,
      document.createElement('div'),
      null,
    );
    expect(result.current).toEqual({ top: 0, left: 0 });
  });

  it('calculates position when hovered with valid refs', () => {
    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, {
      top: 100,
      bottom: 120,
      left: 200,
      right: 300,
      width: 100,
      height: 20,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    });

    mockElementRect(tooltip, {
      top: 0,
      bottom: 30,
      left: 0,
      right: 80,
      width: 80,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { result } = renderTooltipPosition(true, container, tooltip);

    // top = bottom + 8 = 128, left = 200 + 50 - 40 = 210
    expect(result.current.top).toBe(128);
    expect(result.current.left).toBe(210);
  });

  it('clamps left to padding when tooltip overflows left edge', () => {
    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, {
      top: 100,
      bottom: 130,
      left: 10,
      right: 30,
      width: 20,
      height: 30,
      x: 10,
      y: 100,
      toJSON: () => ({}),
    });

    mockElementRect(tooltip, {
      top: 0,
      bottom: 200,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });

    const { result } = renderTooltipPosition(true, container, tooltip);

    // left = 10 + 10 - 100 = -80 → clamped to padding (16)
    expect(result.current.left).toBe(16);
  });

  it('clamps left when tooltip overflows right edge', () => {
    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, {
      top: 100,
      bottom: 130,
      left: 300,
      right: 380,
      width: 80,
      height: 30,
      x: 300,
      y: 100,
      toJSON: () => ({}),
    });

    mockElementRect(tooltip, {
      top: 0,
      bottom: 200,
      left: 0,
      right: 200,
      width: 200,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });

    const { result } = renderTooltipPosition(true, container, tooltip);

    // left = 300 + 40 - 100 = 240; 240 + 200 = 440 > 384 → clamped to 400 - 200 - 16 = 184
    expect(result.current.left).toBe(184);
  });

  it('flips tooltip above container when it overflows bottom', () => {
    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, {
      top: 100,
      bottom: 130,
      left: 400,
      right: 500,
      width: 100,
      height: 30,
      x: 400,
      y: 100,
      toJSON: () => ({}),
    });

    mockElementRect(tooltip, {
      top: 0,
      bottom: 100,
      left: 0,
      right: 120,
      width: 120,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 200,
      writable: true,
    });

    const { result } = renderTooltipPosition(true, container, tooltip);

    // top = 130 + 8 = 138; 138 + 100 = 238 > 200 - 16 = 184 → flip to 100 - 100 - 8 = -8
    expect(result.current.top).toBe(-8);
  });

  it('cleans up event listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, {
      top: 0,
      bottom: 30,
      left: 100,
      right: 150,
      width: 50,
      height: 30,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    mockElementRect(tooltip, {
      top: 0,
      bottom: 30,
      left: 0,
      right: 60,
      width: 60,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { unmount } = renderTooltipPosition(true, container, tooltip);

    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('recalculates on scroll event', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
    });

    let containerTop = 100;
    const container = document.createElement('div');
    const tooltip = document.createElement('div');

    mockElementRect(container, () => ({
      top: containerTop,
      bottom: containerTop + 30,
      left: 200,
      right: 300,
      width: 100,
      height: 30,
      x: 200,
      y: containerTop,
      toJSON: () => ({}),
    }));

    mockElementRect(tooltip, {
      top: 0,
      bottom: 40,
      left: 0,
      right: 120,
      width: 120,
      height: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const { result } = renderTooltipPosition(true, container, tooltip);

    expect(result.current.top).toBe(138);

    containerTop = 50;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.top).toBe(88);
  });
});
