/**
 * Centralized gradient definitions
 * Provides consistent gradient classes across the application
 */

export const GRADIENTS = {
  // Primary brand gradients
  primary: 'from-purple-600 to-blue-600',
  primaryLight: 'from-purple-400 to-blue-400',
  primaryDark: 'from-purple-700 to-blue-700',

  // Step/feature gradients
  purple: 'from-purple-500 to-violet-600',
  blue: 'from-blue-500 to-cyan-600',
  green: 'from-green-500 to-emerald-600',

  // Additional color gradients
  orange: 'from-orange-500 to-red-500',
  pink: 'from-pink-500 to-purple-500',
  teal: 'from-teal-500 to-blue-500',

  // Background gradients
  bgPurple: 'from-purple-900/20 to-blue-900/20',
  bgPurpleDark: 'from-purple-900 via-purple-900/20 to-blue-900/20',

  // Hover effects
  hoverPurple: 'from-purple-500/10 to-blue-500/10',
  hoverPink: 'from-pink-500/10 to-purple-500/10',

  // CTA backgrounds
  ctaBg: 'from-purple-600 via-blue-600 to-purple-600',

  // Feature specific
  featurePurple: 'from-purple-400 to-pink-600',
  featureBlue: 'from-blue-400 to-cyan-600',
  featureGreen: 'from-green-400 to-emerald-600',
  featureOrange: 'from-orange-400 to-red-600',
} as const;
