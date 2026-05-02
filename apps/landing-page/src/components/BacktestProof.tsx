'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { MESSAGES } from '@/config/messages';
import { SectionHeader } from './layout';

export function BacktestProof() {
  return (
    <section id="backtest" className="py-24 relative z-20 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={MESSAGES.backtest.title}
          subtitle={MESSAGES.backtest.subtitle}
          gradient="from-emerald-300 to-blue-300"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MESSAGES.backtest.stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              data-testid="backtest-stat-tile"
              className="group relative p-6 rounded-2xl bg-gray-900/30 backdrop-blur-sm border border-gray-800 hover:border-emerald-400/40 hover:bg-gray-900/50 transition-all duration-300 overflow-hidden"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -4 }}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm font-medium uppercase tracking-wide text-gray-400 mb-3">
                {stat.label}
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-blue-300 mb-3">
                {stat.value}
              </p>
              <p className="text-sm text-gray-300 leading-relaxed">
                {stat.sublabel}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-5 text-center"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          viewport={{ once: true }}
        >
          <p className="text-sm text-gray-400 max-w-2xl">
            {MESSAGES.backtest.disclaimer}
          </p>
          <a
            href={MESSAGES.backtest.ctaLink}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-300/20 transition-colors"
          >
            {MESSAGES.backtest.ctaText}
            <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
