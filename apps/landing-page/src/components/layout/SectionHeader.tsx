'use client';

import { motion } from 'framer-motion';

interface SectionHeaderProps {
  title: string | React.ReactNode;
  subtitle: string;
  gradient?: string;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  gradient = 'from-purple-400 to-blue-400',
  className = '',
}: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className={`text-center mb-20 ${className}`}
    >
      <h2 className="text-4xl sm:text-5xl font-bold mb-6">
        {typeof title === 'string' ? (
          <span className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
            {title}
          </span>
        ) : (
          title
        )}
      </h2>
      <p className="text-xl text-gray-300 max-w-3xl mx-auto">{subtitle}</p>
    </motion.div>
  );
}
