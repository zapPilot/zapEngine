import { Brain, Shield, Calendar, LineChart, type LucideIcon } from 'lucide-react';
import { MESSAGES } from './messages';
import { LINKS } from './links';

/**
 * Feature visual configuration
 * Maps feature index to visual properties (icon, gradient, animation delay)
 */
export interface FeatureConfig {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind gradient classes for the feature card */
  gradient: string;
  /** Animation delay in seconds for staggered entrance */
  delay: number;
}

/**
 * Visual configuration for each feature
 * Order must match MESSAGES.features.items
 */
export const FEATURE_VISUALS: FeatureConfig[] = [
  {
    icon: Brain,
    gradient: 'from-purple-500 to-violet-600',
    delay: 0.1,
  },
  {
    icon: Shield,
    gradient: 'from-blue-500 to-cyan-600',
    delay: 0.2,
  },
  {
    icon: Calendar,
    gradient: 'from-green-500 to-emerald-600',
    delay: 0.3,
  },
  {
    icon: LineChart,
    gradient: 'from-orange-500 to-red-600',
    delay: 0.4,
  },
];

/**
 * Combined feature data with text content and visual config
 */
export interface Feature extends FeatureConfig {
  title: string;
  description: string;
}

/**
 * Get all features with combined text and visual data
 * @throws Error if MESSAGES.features.items and FEATURE_VISUALS arrays have different lengths
 */
export function getFeatures(): Feature[] {
  const itemsLength = MESSAGES.features.items.length;
  const visualsLength = FEATURE_VISUALS.length;

  if (itemsLength !== visualsLength) {
    throw new Error(
      `Features configuration mismatch: MESSAGES.features.items has ${itemsLength} items, ` +
        `but FEATURE_VISUALS has ${visualsLength} items. These arrays must be synchronized.`
    );
  }

  return MESSAGES.features.items.map((item, index) => ({
    ...item,
    ...FEATURE_VISUALS[index],
  }));
}

/**
 * Features section configuration
 */
export const FEATURES_CONFIG = {
  /** Section ID for navigation anchors */
  sectionId: 'features',
  /** Title parts for custom rendering */
  title: {
    prefix: 'Why',
    highlight: 'Zap Pilot?',
  },
  /** Subtitle text */
  subtitle: MESSAGES.features.subtitle,
  /** Learn more link for each feature card */
  learnMoreLink: LINKS.documentation + 'docs/how-it-works',
  /** Main CTA button configuration */
  ctaButton: {
    text: 'Explore All Features',
    href: LINKS.documentation + 'docs/how-it-works',
  },
} as const;
