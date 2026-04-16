/**
 * Type-safe factories for creating React mouse and touch events in tests
 * Eliminates need for `as unknown as` type assertions
 */

import type { MouseEvent, TouchEvent } from "react";
import { vi } from "vitest";

/**
 * Mock SVG element with proper getBoundingClientRect
 */
export function createMockSVGElement(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  // Override getBoundingClientRect with typed return
  svg.getBoundingClientRect = vi.fn(
    (): DOMRect => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    })
  );

  return svg;
}

/**
 * Create typed React MouseEvent for SVG elements
 */
export function createMouseEvent(
  clientX: number,
  clientY: number,
  currentTarget: SVGSVGElement,
  eventInit?: Partial<MouseEvent<SVGSVGElement>>
): MouseEvent<SVGSVGElement> {
  const nativeEvent = new window.MouseEvent("mousemove", { clientX, clientY });

  return {
    clientX,
    clientY,
    currentTarget,
    target: currentTarget,
    nativeEvent,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    eventPhase: Event.AT_TARGET,
    isTrusted: true,
    timeStamp: Date.now(),
    type: "mousemove",
    altKey: false,
    button: 0,
    buttons: 0,
    ctrlKey: false,
    metaKey: false,
    movementX: 0,
    movementY: 0,
    pageX: clientX,
    pageY: clientY,
    relatedTarget: null,
    screenX: clientX,
    screenY: clientY,
    shiftKey: false,
    detail: 0,
    view: window,
    which: 1,
    getModifierState: () => false,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    persist: vi.fn(),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...eventInit,
  } as MouseEvent<SVGSVGElement>;
}

/**
 * Create typed React TouchEvent for SVG elements
 */
export function createTouchEvent(
  clientX: number,
  clientY: number,
  currentTarget: SVGSVGElement,
  eventInit?: Partial<TouchEvent<SVGSVGElement>>
): TouchEvent<SVGSVGElement> {
  const touch: Touch = {
    clientX,
    clientY,
    force: 1,
    identifier: 0,
    pageX: clientX,
    pageY: clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    screenX: clientX,
    screenY: clientY,
    target: currentTarget,
  };

  const nativeTouchEvent = new window.TouchEvent("touchmove", {
    touches: [touch],
    changedTouches: [touch],
    targetTouches: [touch],
    bubbles: true,
    cancelable: true,
  });

  return {
    touches: [touch],
    changedTouches: [touch],
    targetTouches: [touch],
    currentTarget,
    target: currentTarget,
    nativeEvent: nativeTouchEvent,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    eventPhase: Event.AT_TARGET,
    isTrusted: true,
    timeStamp: Date.now(),
    type: "touchmove",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    detail: 0,
    view: window,
    getModifierState: () => false,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    persist: vi.fn(),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...eventInit,
  } as TouchEvent<SVGSVGElement>;
}

/**
 * Event factory with fluent API for creating test events
 */
export class SVGEventFactory {
  private svg: SVGSVGElement;

  constructor(rect = { left: 0, top: 0, width: 800, height: 300 }) {
    this.svg = createMockSVGElement(rect);
  }

  /**
   * Create a mouse move event at the specified coordinates
   */
  mouseMove(clientX: number, clientY: number): MouseEvent<SVGSVGElement> {
    return createMouseEvent(clientX, clientY, this.svg);
  }

  /**
   * Create a mouse leave event
   */
  mouseLeave(): MouseEvent<SVGSVGElement> {
    const nativeEvent = new window.MouseEvent("mouseleave", { bubbles: false });

    return {
      ...createMouseEvent(0, 0, this.svg),
      type: "mouseleave",
      nativeEvent,
    };
  }

  /**
   * Create a touch move event at the specified coordinates
   */
  touchMove(clientX: number, clientY: number): TouchEvent<SVGSVGElement> {
    return createTouchEvent(clientX, clientY, this.svg);
  }

  /**
   * Create a touch start event
   */
  touchStart(clientX: number, clientY: number): TouchEvent<SVGSVGElement> {
    const event = createTouchEvent(clientX, clientY, this.svg);
    return {
      ...event,
      type: "touchstart",
      nativeEvent: new window.TouchEvent("touchstart", {
        touches: event.touches,
        changedTouches: event.changedTouches,
        targetTouches: event.targetTouches,
        bubbles: true,
        cancelable: true,
      }),
    };
  }

  /**
   * Create a touch end event
   */
  touchEnd(): TouchEvent<SVGSVGElement> {
    const nativeEvent = new window.TouchEvent("touchend", {
      touches: [],
      changedTouches: [],
      targetTouches: [],
      bubbles: true,
      cancelable: true,
    });

    return {
      touches: [],
      changedTouches: [],
      targetTouches: [],
      currentTarget: this.svg,
      target: this.svg,
      nativeEvent,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      eventPhase: Event.AT_TARGET,
      isTrusted: true,
      timeStamp: Date.now(),
      type: "touchend",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      detail: 0,
      view: window,
      getModifierState: () => false,
      isDefaultPrevented: () => false,
      isPropagationStopped: () => false,
      persist: vi.fn(),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as TouchEvent<SVGSVGElement>;
  }

  /**
   * Get the underlying SVG element for direct manipulation
   */
  getSVG(): SVGSVGElement {
    return this.svg;
  }

  /**
   * Update the SVG bounding rect (useful for responsive tests)
   */
  updateRect(rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): void {
    this.svg.getBoundingClientRect = vi.fn(
      (): DOMRect => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
      })
    );
  }
}

/**
 * Helper to simulate a sequence of mouse movements (useful for drag/swipe tests)
 */
export function createMouseMoveSequence(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number,
  svg: SVGSVGElement
): MouseEvent<SVGSVGElement>[] {
  const events: MouseEvent<SVGSVGElement>[] = [];
  const deltaX = (endX - startX) / steps;
  const deltaY = (endY - startY) / steps;

  for (let i = 0; i <= steps; i++) {
    events.push(
      createMouseEvent(startX + deltaX * i, startY + deltaY * i, svg)
    );
  }

  return events;
}

/**
 * Helper to simulate a sequence of touch movements
 */
export function createTouchMoveSequence(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps: number,
  svg: SVGSVGElement
): TouchEvent<SVGSVGElement>[] {
  const events: TouchEvent<SVGSVGElement>[] = [];
  const deltaX = (endX - startX) / steps;
  const deltaY = (endY - startY) / steps;

  for (let i = 0; i <= steps; i++) {
    events.push(
      createTouchEvent(startX + deltaX * i, startY + deltaY * i, svg)
    );
  }

  return events;
}
