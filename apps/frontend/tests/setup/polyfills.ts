import { vi } from 'vitest';

global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin = '';
  thresholds: readonly number[] = [];

  constructor(
    _callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.root = (options?.root as Element) || null;
    this.rootMargin = options?.rootMargin || '';
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold || 0];
  }

  disconnect() {
    // Mock implementation
  }
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
} as any;

global.ResizeObserver = class ResizeObserver {
  disconnect() {
    // Mock implementation
  }
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
} as any;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

if (typeof window !== 'undefined') {
  try {
    if (typeof window.location.reload !== 'function') {
      (window.location as any).reload = vi.fn();
    }
  } catch (_err) {
    // Fallback if location object is completely locked
  }
}

(global as any).PointerEvent = class PointerEvent extends Event {
  pointerId: number;
  width: number;
  height: number;
  pressure: number;
  tangentialPressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  pointerType: string;
  isPrimary: boolean;
  altitudeAngle = 0;
  azimuthAngle = 0;

  constructor(type: string, eventInitDict: any = {}) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict.pointerId || 0;
    this.width = eventInitDict.width || 1;
    this.height = eventInitDict.height || 1;
    this.pressure = eventInitDict.pressure || 0;
    this.tangentialPressure = eventInitDict.tangentialPressure || 0;
    this.tiltX = eventInitDict.tiltX || 0;
    this.tiltY = eventInitDict.tiltY || 0;
    this.twist = eventInitDict.twist || 0;
    this.pointerType = eventInitDict.pointerType || '';
    this.isPrimary = eventInitDict.isPrimary || false;
  }

  getCoalescedEvents() {
    return [];
  }
  getPredictedEvents() {
    return [];
  }
};

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();

Element.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
  top: 100,
  left: 100,
  bottom: 200,
  right: 200,
  width: 100,
  height: 100,
  x: 100,
  y: 100,
  toJSON: () => ({}),
});
