import { motion } from 'framer-motion';

interface AnimatedGradientBgProps {
  /**
   * Base gradient colors (e.g., 'from-purple-600 via-blue-600 to-purple-600')
   */
  gradient: string;
  /**
   * Opacity of the gradient background (0-1)
   */
  opacity?: number;
  /**
   * Animation duration in seconds
   */
  duration?: number;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Animated gradient background component with smooth color transitions
 */
export function AnimatedGradientBg({
  gradient,
  opacity = 0.9,
  duration = 10,
  className = '',
}: AnimatedGradientBgProps) {
  return (
    <>
      {/* Base gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-r ${gradient} ${className}`}
        style={{ opacity }}
      />

      {/* Animated overlay gradient */}
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(45deg, rgba(147, 51, 234, 0.1) 0%, rgba(59, 130, 246, 0.1) 50%, rgba(147, 51, 234, 0.1) 100%)',
          backgroundSize: '400% 400%',
        }}
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{
          duration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </>
  );
}
