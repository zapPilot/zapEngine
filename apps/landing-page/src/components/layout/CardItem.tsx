'use client';

import { motion } from 'framer-motion';

interface CardItemProps {
  index: number;
  children: React.ReactNode;
  hoverScale?: boolean;
  className?: string;
}

export function CardItem({ index, children, hoverScale = true, className = '' }: CardItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      whileHover={hoverScale ? { scale: 1.03, y: -5 } : undefined}
      className={className}
    >
      <div className="bg-gray-900/50 backdrop-blur-lg border border-gray-800 rounded-3xl p-8 hover:border-gray-700 transition-all duration-300 relative overflow-hidden h-full">
        {children}
      </div>
    </motion.div>
  );
}
