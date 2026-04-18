'use client';

import { motion } from 'framer-motion';
import { SectionHeader, CardGrid, CardItem } from './layout';
import { rotatingBorder } from '@/lib/motion/animations';
import { getFeatures, FEATURES_CONFIG } from '@/config/features';
import { MESSAGES } from '@/config/messages';

export function Features() {
  const features = getFeatures();

  return (
    <section id={FEATURES_CONFIG.sectionId} className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={
            <>
              {FEATURES_CONFIG.title.prefix}
              <span className="ml-3">{FEATURES_CONFIG.title.highlight}</span>
            </>
          }
          subtitle={FEATURES_CONFIG.subtitle}
        />

        <CardGrid columns={2}>
          {features.map((feature, index) => (
            <CardItem
              key={feature.title}
              index={index}
              hoverScale={false}
              className="group relative"
            >
              {/* Animated background gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
              />

              {/* Animated border effect */}
              <motion.div
                className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                style={{
                  background: `conic-gradient(from 0deg, transparent, rgba(147, 51, 234, 0.1), transparent)`,
                }}
                {...rotatingBorder()}
              />

              <div className="relative z-10">
                {/* Icon */}
                <motion.div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                  whileHover={{ rotate: 5 }}
                >
                  <feature.icon className="w-8 h-8 text-white" />
                </motion.div>

                {/* Content */}
                <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-blue-400 group-hover:bg-clip-text transition-all duration-300">
                  {feature.title}
                </h3>

                <p className="text-gray-300 text-lg leading-relaxed group-hover:text-gray-300 transition-colors duration-300">
                  {feature.description}
                </p>

                {/* Learn more link */}
                <motion.div
                  className="mt-6 inline-flex items-center text-purple-400 hover:text-purple-300 transition-colors duration-200 opacity-0 group-hover:opacity-100"
                  initial={{ x: -10 }}
                  whileHover={{ x: 0 }}
                >
                  <a
                    className="text-sm font-medium mr-2"
                    href={FEATURES_CONFIG.learnMoreLink}
                    target="_blank"
                  >
                    {MESSAGES.features.learnMore}
                  </a>
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    →
                  </motion.div>
                </motion.div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-tr from-pink-500/10 to-purple-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            </CardItem>
          ))}
        </CardGrid>
      </div>
    </section>
  );
}
