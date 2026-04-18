import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { pulsingRing } from '@/lib/motion/animations';

interface Step {
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}

interface StepCardProps {
  step: Step;
  index: number;
  variant: 'desktop' | 'mobile';
  stepMotion: (index: number) => {
    initial: { opacity: number; y: number };
    whileInView: { opacity: number; y: number };
    transition: { duration: number; delay: number };
    viewport: { once: boolean };
  };
  isLastStep?: boolean;
}

/**
 * Desktop variant of the step card
 */
function DesktopStepCard({
  step,
  index,
  stepMotion,
}: Omit<StepCardProps, 'variant' | 'isLastStep'>) {
  return (
    <motion.div {...stepMotion(index)} className="text-center group">
      {/* Step Number Circle */}
      <motion.div
        className={`relative mx-auto w-24 h-24 rounded-full bg-gradient-to-r ${step.color} flex items-center justify-center text-white text-2xl font-bold mb-8 group-hover:scale-110 transition-transform duration-300`}
        whileHover={{ rotate: 5 }}
      >
        {step.number}

        {/* Pulsing ring */}
        <motion.div
          className={`absolute inset-0 rounded-full bg-gradient-to-r ${step.color} opacity-10`}
          {...pulsingRing(index * 0.5)}
        />
      </motion.div>

      {/* Content */}
      <div className="bg-gray-900/50 backdrop-blur-lg border border-gray-800 rounded-2xl p-8 group-hover:border-gray-700 transition-all duration-300">
        <motion.div
          className={`w-16 h-16 mx-auto rounded-xl bg-gradient-to-r ${step.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
          whileHover={{ rotate: -5 }}
        >
          <step.icon className="w-8 h-8 text-white" />
        </motion.div>

        <h3 className="text-2xl font-bold text-white mb-4">{step.title}</h3>

        <p className="text-gray-300 leading-relaxed">{step.description}</p>
      </div>
    </motion.div>
  );
}

/**
 * Mobile variant of the step card
 */
function MobileStepCard({ step, index, stepMotion, isLastStep }: Omit<StepCardProps, 'variant'>) {
  return (
    <motion.div {...stepMotion(index)} className="relative">
      <div className="flex items-start space-x-6">
        {/* Step Number */}
        <motion.div
          className={`flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-r ${step.color} flex items-center justify-center text-white text-xl font-bold`}
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          {step.number}
        </motion.div>

        {/* Content */}
        <div className="flex-1">
          <div className="bg-gray-900/50 backdrop-blur-lg border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center mb-4">
              <div
                className={`w-12 h-12 rounded-lg bg-gradient-to-r ${step.color} flex items-center justify-center mr-4`}
              >
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">{step.title}</h3>
            </div>

            <p className="text-gray-300">{step.description}</p>
          </div>
        </div>
      </div>

      {/* Connection line for mobile */}
      {!isLastStep && (
        <div className="flex justify-start ml-8 mt-6 mb-6">
          <div className="w-0.5 h-12 bg-gradient-to-b from-gray-600 to-gray-800" />
        </div>
      )}
    </motion.div>
  );
}

/**
 * Unified StepCard component that renders desktop or mobile variant
 */
export function StepCard({ variant, ...props }: StepCardProps) {
  return variant === 'desktop' ? <DesktopStepCard {...props} /> : <MobileStepCard {...props} />;
}
