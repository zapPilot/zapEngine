'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { type Stat } from '@/lib/statistics';

interface StatDisplayProps {
  stat: Stat;
  index: number;
  variant?: 'hero' | 'cta';
  animate?: boolean;
}

export function StatDisplay({ stat, index, variant = 'hero', animate = true }: StatDisplayProps) {
  const isHero = variant === 'hero';
  const isCTA = variant === 'cta';

  const containerClasses = isHero
    ? 'group relative p-4 sm:p-6 rounded-2xl bg-gray-900/20 backdrop-blur-sm border border-gray-800 hover:border-gray-700 hover:bg-gray-900/40 transition-all duration-300'
    : 'text-center';

  const valueClasses = isHero
    ? 'text-3xl sm:text-4xl md:text-5xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400'
    : 'text-3xl md:text-4xl font-bold text-white mb-2';

  const labelClasses = isHero
    ? 'text-sm sm:text-base md:text-lg text-gray-300 group-hover:text-gray-300 transition-colors'
    : 'text-white/80 text-sm';

  const content = (
    <div className="flex flex-col items-center justify-center h-full">
      {stat.type === 'text' ? (
        <>
          <div className={valueClasses}>{stat.value}</div>
          <div className={labelClasses}>{stat.label}</div>
        </>
      ) : (
        <>
          {/* Icon row */}
          <div className={`flex items-center justify-center ${isHero ? 'gap-3' : 'gap-2'} mb-3`}>
            {stat.icons?.map(icon => (
              <div key={icon.name} className="relative group/icon flex items-center justify-center">
                <Image
                  src={icon.src}
                  alt={icon.alt}
                  width={isHero ? 48 : 40}
                  height={isHero ? 48 : 40}
                  className="transition-transform group-hover/icon:scale-110"
                />
                {isHero && (
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-gray-400 opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {icon.name}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className={`${labelClasses} text-center`}>{stat.label}</div>
        </>
      )}
    </div>
  );

  if (isHero) {
    return (
      <motion.div
        className={containerClasses}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.2 + index * 0.1 }}
        whileHover={{ scale: 1.05, y: -5 }}
      >
        {content}
      </motion.div>
    );
  }

  if (isCTA && animate) {
    return (
      <motion.div
        className={containerClasses}
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.8 + index * 0.1 }}
        viewport={{ once: true }}
      >
        {content}
      </motion.div>
    );
  }

  return <div className={containerClasses}>{content}</div>;
}
