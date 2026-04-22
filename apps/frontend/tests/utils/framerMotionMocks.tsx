/**
 * Type-safe mocks for Framer Motion to simplify component testing
 * Strips animation logic while preserving component structure
 */

import { createElement, type ReactNode } from 'react';

type MotionElement = keyof JSX.IntrinsicElements;
type MotionProps<T extends MotionElement> = JSX.IntrinsicElements[T] & {
  children?: ReactNode;
};

const MOTION_PROP_KEYS = new Set([
  'animate',
  'custom',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'dragTransition',
  'exit',
  'initial',
  'layout',
  'layoutId',
  'onAnimationComplete',
  'onAnimationStart',
  'onDrag',
  'onDragEnd',
  'onDragStart',
  'onPan',
  'onPanEnd',
  'onPanStart',
  'onUpdate',
  'onViewportEnter',
  'onViewportLeave',
  'transformTemplate',
  'transition',
  'variants',
  'viewport',
  'whileFocus',
  'whileHover',
  'whileInView',
  'whileTap',
]);

const stripMotionProps = (
  props: Record<string, unknown>,
): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !MOTION_PROP_KEYS.has(key)),
  );
};

/**
 * Create a motion mock for a specific intrinsic element.
 *
 * @param element - The intrinsic element tag to render.
 * @returns A mock motion component that strips animation-only props.
 *
 * @example
 * const motionDiv = createMockMotionComponent("div");
 */
export const createMockMotionComponent = <T extends MotionElement>(
  element: T,
) => {
  const MockMotionComponent = ({
    children,
    ...props
  }: MotionProps<T>): ReactNode => {
    return createElement(
      element,
      stripMotionProps(props as Record<string, unknown>),
      children,
    );
  };

  MockMotionComponent.displayName = `MockMotion${element}`;

  return MockMotionComponent;
};

/**
 * Mock Framer Motion components that render as plain DOM elements.
 */
export const mockFramerMotion = {
  button: createMockMotionComponent('button'),
  circle: createMockMotionComponent('circle'),
  div: createMockMotionComponent('div'),
  g: createMockMotionComponent('g'),
  line: createMockMotionComponent('line'),
};

/**
 * Mock AnimatePresence component (pass-through)
 */
export function MockAnimatePresence({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Setup function to apply all Framer Motion mocks
 * Call this in vi.mock() blocks or test setup
 */
export function setupFramerMotionMocks() {
  return {
    motion: mockFramerMotion,
    AnimatePresence: MockAnimatePresence,
  };
}
