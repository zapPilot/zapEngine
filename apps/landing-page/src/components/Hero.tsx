'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { LINKS, openExternalLink } from '@/config/links';
import { STATISTICS } from '@/lib/statistics';
import { StatDisplay } from '@/components/StatDisplay';
import { MESSAGES } from '@/config/messages';
import { scaleOnHover, containerWithStagger } from '@/lib/motion/animations';
import { GRADIENTS } from '@/config/gradients';

export function Hero() {
  const { container: containerVariants, item: itemVariants } = containerWithStagger();

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-16">
      <div className="max-w-7xl mx-auto">
        {/* Hero Content */}
        <motion.div
          className="text-center max-w-4xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Badge */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 mb-8"
          >
            <Sparkles className="w-4 h-4 text-purple-400 mr-2" />
            <span className="text-sm font-medium text-purple-300">{MESSAGES.hero.badge}</span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            variants={itemVariants}
            className="text-6xl sm:text-7xl md:text-8xl font-bold mb-8 sm:mb-10 md:mb-12 leading-[1.1] tracking-tight"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 drop-shadow-[0_0_30px_rgba(168,85,247,0.4)]">
              {MESSAGES.hero.title.line1}
            </span>
            <br />
            <span className="text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              {MESSAGES.hero.title.line2}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={itemVariants}
            className="text-xl sm:text-2xl md:text-2xl text-gray-300 mb-10 sm:mb-14 md:mb-16 max-w-3xl mx-auto leading-relaxed"
          >
            {MESSAGES.hero.subtitle}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16 sm:mb-20 md:mb-24"
          >
            <motion.button
              className={`group relative px-12 py-6 text-lg sm:text-xl bg-gradient-to-r ${GRADIENTS.primary} text-white font-semibold rounded-2xl shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 ring-2 ring-purple-400/20 hover:ring-purple-400/50`}
              {...scaleOnHover}
              whileTap={{ scale: 0.98 }}
              onClick={() => openExternalLink(LINKS.app)}
            >
              <span className="relative z-10 flex items-center justify-center">
                {MESSAGES.hero.ctaPrimary}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity" />
            </motion.button>

            <motion.button
              className="px-12 py-6 text-lg sm:text-xl border-2 border-gray-600 text-white font-semibold rounded-2xl hover:border-purple-500 hover:bg-purple-500/10 transition-all duration-300 flex items-center justify-center"
              {...scaleOnHover}
              whileTap={{ scale: 0.98 }}
              onClick={() => openExternalLink(LINKS.social.youtube)}
            >
              <Play className="mr-2 w-5 h-5 group-hover:scale-110 transition-transform" />
              {MESSAGES.hero.ctaSecondary}
            </motion.button>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10 lg:gap-12 max-w-5xl mx-auto"
          >
            {STATISTICS.map((stat, index) => (
              <StatDisplay key={stat.label} stat={stat} index={index} variant="hero" />
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
