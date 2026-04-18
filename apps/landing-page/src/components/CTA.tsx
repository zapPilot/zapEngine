'use client';

import { motion } from 'framer-motion';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LINKS, openExternalLink } from '@/config/links';
import { MESSAGES } from '@/config/messages';
import { fadeInUpStaggered, scaleOnHover } from '@/lib/motion/animations';
import { FloatingOrb, AnimatedGradientBg } from '@/components/ui';
import { GRADIENTS } from '@/config/gradients';

export function CTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Animated background */}
      <AnimatedGradientBg gradient={GRADIENTS.ctaBg} />

      {/* Floating orbs */}
      <FloatingOrb size={128} position="top-20 left-20" duration={6} yRange={20} />
      <FloatingOrb
        size={160}
        position="bottom-20 right-20"
        duration={8}
        yRange={20}
        scaleRange={[1, 0.9]}
        delay={2}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div {...fadeInUpStaggered(0)} transition={{ duration: 0.8 }}>
          {/* Philosophy Quote */}
          <p className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-blue-300 mb-4">
            &ldquo;{MESSAGES.slogans.philosophy}&rdquo;
          </p>
          <p className="text-white/60 text-sm mb-10 max-w-xl mx-auto">
            {MESSAGES.slogans.philosophyDescription}
          </p>

          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
            {MESSAGES.cta.title}
            <span className="block">{MESSAGES.cta.titleSecondLine}</span>
          </h2>

          <motion.p
            className="text-xl text-white/90 mb-12 max-w-3xl mx-auto"
            {...fadeInUpStaggered(0.2)}
            transition={{ duration: 0.8 }}
          >
            {MESSAGES.cta.subtitle}
          </motion.p>

          {/* Main CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-6 justify-center mb-16"
            {...fadeInUpStaggered(0.4)}
            transition={{ duration: 0.8 }}
          >
            <motion.button
              className="group bg-white text-purple-600 px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300"
              {...scaleOnHover}
              onClick={() => openExternalLink(LINKS.app)}
            >
              <span className="flex items-center justify-center">
                {MESSAGES.cta.ctaPrimary}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>

            <motion.button
              className="group bg-white/10 backdrop-blur-lg text-white px-8 py-4 rounded-xl font-semibold text-lg border border-white/20 hover:bg-white/20 transition-all duration-300"
              {...scaleOnHover}
              onClick={() => openExternalLink(LINKS.documentation)}
            >
              <span className="flex items-center justify-center">
                <BookOpen className="mr-2 w-5 h-5" />
                {MESSAGES.cta.ctaSecondary}
              </span>
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
