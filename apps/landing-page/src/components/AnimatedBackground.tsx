'use client';

import { motion } from 'framer-motion';
import { FloatingOrb } from '@/components/ui';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function AnimatedBackground() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-purple-950/20 to-blue-950/20" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-purple-950/20 to-blue-950/20" />

      <FloatingOrb
        size={384}
        position="top-20 left-10"
        xRange={100}
        yRange={50}
        scaleRange={[1, 1.2]}
        duration={45}
        className="bg-purple-500/10 gpu-accelerate"
      />

      <FloatingOrb
        size={320}
        position="bottom-20 right-10"
        xRange={-80}
        yRange={-60}
        scaleRange={[1, 0.8]}
        duration={35}
        delay={5}
        className="bg-blue-500/10"
      />

      {/* Pink orb with complex multi-point animation - kept as custom implementation */}
      <motion.div
        className="absolute top-1/2 left-1/2 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl"
        animate={{
          x: [0, 60, -60, 0],
          y: [0, -40, 40, 0],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 50,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 10,
        }}
      />
    </div>
  );
}
