/**
 * Reusable Framer Motion animation presets
 * Eliminates duplication of motion props across components
 */

// Standard button hover effects
export const scaleOnHover = {
  whileHover: { scale: 1.05, y: -2 },
  whileTap: { scale: 0.95 },
} as const;

/**
 * Creates a staggered fade-in animation
 * @param delay - Base delay in seconds
 * @returns Animation props with staggered timing
 */
export function fadeInUpStaggered(delay = 0) {
  return {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay },
    viewport: { once: true },
  } as const;
}

/**
 * Generic reveal preset that can be reused to avoid duplicated motion blocks.
 */
export function revealOnView({
  delay = 0,
  duration = 0.8,
  offsetY = 30,
}: {
  delay?: number;
  duration?: number;
  offsetY?: number;
} = {}) {
  return {
    initial: { opacity: 0, y: offsetY },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration, delay },
    viewport: { once: true },
  } as const;
}

/**
 * Staggered slide-in animation from the side
 * @param index - Item index for stagger calculation
 * @param from - Direction to slide from ('left' or 'right')
 * @param staggerDelay - Delay between items in seconds
 * @returns Animation props with staggered timing
 */
export function staggeredSlideIn(
  index: number,
  from: 'left' | 'right' = 'left',
  staggerDelay = 0.1
) {
  return {
    initial: { opacity: 0, x: from === 'left' ? -20 : 20 },
    animate: { opacity: 1, x: 0 },
    transition: { delay: index * staggerDelay },
  } as const;
}

/**
 * Pulsing ring animation for circular elements
 * @param delay - Delay before animation starts
 * @param duration - Duration of one pulse cycle
 * @returns Animation props for pulsing effect
 */
export function pulsingRing(delay = 0, duration = 4) {
  return {
    animate: {
      scale: [1, 1.1, 1] as number[],
      opacity: [0.1, 0, 0.1] as number[],
    },
    transition: {
      duration,
      repeat: Infinity,
      ease: 'easeInOut' as const,
      delay,
    },
  };
}

/**
 * Container variants with staggered children animation
 * @param staggerDelay - Delay between children animations
 * @param delayChildren - Initial delay before children animations start
 * @returns Container and item variants
 */
export function containerWithStagger(staggerDelay = 0.2, delayChildren = 0.3) {
  return {
    container: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay,
          delayChildren,
        },
      },
    },
    item: {
      hidden: { opacity: 0, y: 30 },
      visible: {
        opacity: 1,
        y: 0,
      },
    },
  } as const;
}

/**
 * Rotating border effect animation
 * @param duration - Duration of one rotation cycle
 * @returns Animation props for rotating border
 */
export function rotatingBorder(duration = 12) {
  return {
    animate: {
      rotate: [0, 360] as number[],
    },
    transition: {
      duration,
      repeat: Infinity,
      ease: 'linear' as const,
    },
  };
}
