import { motion } from 'framer-motion';

interface FloatingOrbProps {
  /**
   * Size of the orb (width and height)
   */
  size?: number;
  /**
   * Position class (e.g., 'top-20 left-20')
   */
  position: string;
  /**
   * Animation duration in seconds
   */
  duration?: number;
  /**
   * Animation delay in seconds
   */
  delay?: number;
  /**
   * Vertical movement range in pixels
   */
  yRange?: number;
  /**
   * Horizontal movement range in pixels
   */
  xRange?: number;
  /**
   * Scale variation
   */
  scaleRange?: [number, number];
  /**
   * Rotation variation in degrees
   */
  rotateRange?: [number, number];
  /**
   * Opacity of the orb
   */
  opacity?: number;
  /**
   * Optional className for custom styling (e.g., background color)
   */
  className?: string;
}

/**
 * Floating orb animation component for decorative backgrounds
 */
export function FloatingOrb({
  size = 128,
  position,
  duration = 6,
  delay = 0,
  yRange = 20,
  xRange = 0,
  scaleRange = [1, 1.1],
  rotateRange,
  opacity = 0.1,
  className = '',
}: FloatingOrbProps) {
  return (
    <motion.div
      className={`absolute ${position} rounded-full blur-xl bg-white pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        opacity,
      }}
      animate={{
        x: xRange ? [0, xRange, 0] : undefined,
        y: [0, -yRange, 0],
        scale: [scaleRange[0], scaleRange[1], scaleRange[0]],
        rotate: rotateRange ? [rotateRange[0], rotateRange[1], rotateRange[0]] : undefined,
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    />
  );
}
