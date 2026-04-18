'use client';

import { Settings, Activity, Shield, Calendar, type LucideIcon } from 'lucide-react';
import { SectionHeader } from './layout';
import { StepCard } from './ui';
import { MESSAGES } from '@/config/messages';
import { revealOnView } from '@/lib/motion/animations';

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  Settings,
  Activity,
  Shield,
  Calendar,
};

export function HowItWorks() {
  const steps = MESSAGES.howItWorks.steps.map(step => ({
    ...step,
    icon: iconMap[step.icon],
  }));

  const stepMotion = (index: number) =>
    revealOnView({
      delay: index * 0.2,
      duration: 0.8,
      offsetY: 50,
    });

  return (
    <section id="how-it-works" className="py-24 relative z-20 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title={
            <>
              How It
              <span className="ml-3">Works</span>
            </>
          }
          subtitle={MESSAGES.howItWorks.subtitle}
        />

        {/* Desktop Layout */}
        <div className="hidden lg:block">
          <div className="relative">
            {/* Connection Lines */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 transform -translate-y-1/2 z-0" />

            {/* Steps */}
            <div className="relative z-10 grid grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <StepCard
                  key={step.number}
                  step={step}
                  index={index}
                  variant="desktop"
                  stepMotion={stepMotion}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden space-y-12">
          {steps.map((step, index) => (
            <StepCard
              key={step.number}
              step={step}
              index={index}
              variant="mobile"
              stepMotion={stepMotion}
              isLastStep={index === steps.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
