import React from 'react';
import { vi } from 'vitest';

type MotionProps = Record<string, unknown>;

const MOTION_ONLY_KEYS = [
  'initial',
  'animate',
  'exit',
  'variants',
  'transition',
  'whileHover',
  'whileTap',
  'whileInView',
  'whileFocus',
  'whileDrag',
  'layout',
  'layoutId',
  'layoutDependency',
  'layoutScroll',
  'viewport',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'dragTransition',
  'dragPropagation',
  'dragSnapToOrigin',
  'onAnimationStart',
  'onAnimationComplete',
  'onDragStart',
  'onDragEnd',
  'onDrag',
  'onDirectionLock',
  'onHoverStart',
  'onHoverEnd',
  'onTap',
  'onTapStart',
  'onTapCancel',
  'onPan',
  'onPanStart',
  'onPanEnd',
  'onViewportEnter',
  'onViewportLeave',
  'transformTemplate',
  'custom',
  'inherit',
] as const;

function filterMotionProps(props: MotionProps): MotionProps {
  const result: MotionProps = {};
  const motionKeys = new Set<string>(MOTION_ONLY_KEYS);
  for (const key of Object.keys(props)) {
    if (!motionKeys.has(key)) {
      result[key] = props[key];
    }
  }
  return result;
}

const MOTION_ELEMENTS = [
  'div',
  'span',
  'p',
  'a',
  'button',
  'ul',
  'li',
  'nav',
  'header',
  'footer',
  'section',
  'article',
  'aside',
  'main',
  'form',
  'input',
  'img',
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'g',
  'text',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const;

type MotionComponentProps = MotionProps & { children?: React.ReactNode };

function createMotionComponent(element: string) {
  const MotionComponent = React.forwardRef<HTMLElement, MotionComponentProps>((props, ref) => {
    const { children, ...rest } = props;
    const filteredProps = filterMotionProps(rest);
    return React.createElement(element, { ...filteredProps, ref }, children as React.ReactNode);
  });
  MotionComponent.displayName = `motion.${element}`;
  return MotionComponent;
}

export function createFramerMotionMock() {
  const motion = Object.fromEntries(
    MOTION_ELEMENTS.map(tag => [tag, createMotionComponent(tag)])
  ) as Record<(typeof MOTION_ELEMENTS)[number], ReturnType<typeof createMotionComponent>>;

  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useAnimation: () => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      set: vi.fn(),
    }),
    useInView: () => true,
    useMotionValue: <T>(initial: T) => ({
      get: () => initial,
      set: vi.fn(),
      onChange: vi.fn(() => () => {}),
      on: vi.fn(() => () => {}),
    }),
    useTransform: <T>(value: T, _input?: unknown, _output?: unknown) => value,
    useSpring: <T>(initial: T) => ({
      get: () => initial,
      set: vi.fn(),
      onChange: vi.fn(() => () => {}),
    }),
    useScroll: () => ({
      scrollX: { get: () => 0, set: vi.fn() },
      scrollY: { get: () => 0, set: vi.fn() },
      scrollXProgress: { get: () => 0, set: vi.fn() },
      scrollYProgress: { get: () => 0, set: vi.fn() },
    }),
    useReducedMotion: () => false,
    stagger: () => 0,
  };
}
