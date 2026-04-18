require('@testing-library/jest-dom');

// Mock window.matchMedia for responsive hooks
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.gtag for analytics
Object.defineProperty(window, 'gtag', {
  writable: true,
  value: jest.fn(),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }) => {
    const React = require('react');
    // Filter out Next.js specific props
    const {
      priority: _p,
      placeholder: _ph,
      blurDataURL: _blur,
      loading: _l,
      unoptimized: _u,
      ...htmlProps
    } = props;
    return React.createElement('img', { alt: alt ?? '', ...htmlProps });
  },
}));

// Helper to filter framer-motion props from DOM elements
const filterMotionProps = props => {
  const {
    // Animation props
    initial: _initial,
    animate: _animate,
    exit: _exit,
    variants: _variants,
    transition: _transition,
    // Gesture props
    whileHover: _whileHover,
    whileTap: _whileTap,
    whileInView: _whileInView,
    whileFocus: _whileFocus,
    whileDrag: _whileDrag,
    // Layout props
    layout: _layout,
    layoutId: _layoutId,
    layoutDependency: _layoutDependency,
    layoutScroll: _layoutScroll,
    // Viewport props
    viewport: _viewport,
    // Drag props
    drag: _drag,
    dragConstraints: _dragConstraints,
    dragElastic: _dragElastic,
    dragMomentum: _dragMomentum,
    dragTransition: _dragTransition,
    dragPropagation: _dragPropagation,
    dragSnapToOrigin: _dragSnapToOrigin,
    // Event handlers
    onAnimationStart: _onAnimationStart,
    onAnimationComplete: _onAnimationComplete,
    onDragStart: _onDragStart,
    onDragEnd: _onDragEnd,
    onDrag: _onDrag,
    onDirectionLock: _onDirectionLock,
    onHoverStart: _onHoverStart,
    onHoverEnd: _onHoverEnd,
    onTap: _onTap,
    onTapStart: _onTapStart,
    onTapCancel: _onTapCancel,
    onPan: _onPan,
    onPanStart: _onPanStart,
    onPanEnd: _onPanEnd,
    onViewportEnter: _onViewportEnter,
    onViewportLeave: _onViewportLeave,
    // Style props - keep style for tests!
    transformTemplate: _transformTemplate,
    // Other motion props
    custom: _custom,
    inherit: _inherit,
    ...htmlProps
  } = props;
  return htmlProps;
};

// Mock framer-motion globally
jest.mock('framer-motion', () => {
  const React = require('react');

  const createMotionComponent = element => {
    const MotionComponent = React.forwardRef(({ children, ...props }, ref) => {
      const filteredProps = filterMotionProps(props);
      return React.createElement(element, { ...filteredProps, ref }, children);
    });
    MotionComponent.displayName = `motion.${element}`;
    return MotionComponent;
  };

  return {
    motion: {
      div: createMotionComponent('div'),
      span: createMotionComponent('span'),
      p: createMotionComponent('p'),
      a: createMotionComponent('a'),
      button: createMotionComponent('button'),
      ul: createMotionComponent('ul'),
      li: createMotionComponent('li'),
      nav: createMotionComponent('nav'),
      header: createMotionComponent('header'),
      footer: createMotionComponent('footer'),
      section: createMotionComponent('section'),
      article: createMotionComponent('article'),
      aside: createMotionComponent('aside'),
      main: createMotionComponent('main'),
      form: createMotionComponent('form'),
      input: createMotionComponent('input'),
      img: createMotionComponent('img'),
      svg: createMotionComponent('svg'),
      path: createMotionComponent('path'),
      circle: createMotionComponent('circle'),
      rect: createMotionComponent('rect'),
      line: createMotionComponent('line'),
      g: createMotionComponent('g'),
      text: createMotionComponent('text'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      h3: createMotionComponent('h3'),
      h4: createMotionComponent('h4'),
      h5: createMotionComponent('h5'),
      h6: createMotionComponent('h6'),
    },
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    useAnimation: () => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      set: jest.fn(),
    }),
    useInView: () => true,
    useMotionValue: initial => ({
      get: () => initial,
      set: jest.fn(),
      onChange: jest.fn(() => () => {}),
      on: jest.fn(() => () => {}),
    }),
    useTransform: (value, _input, _output) => value,
    useSpring: initial => ({
      get: () => initial,
      set: jest.fn(),
      onChange: jest.fn(() => () => {}),
    }),
    useScroll: () => ({
      scrollX: { get: () => 0, set: jest.fn() },
      scrollY: { get: () => 0, set: jest.fn() },
      scrollXProgress: { get: () => 0, set: jest.fn() },
      scrollYProgress: { get: () => 0, set: jest.fn() },
    }),
    useReducedMotion: () => false,
    stagger: () => 0,
  };
});
