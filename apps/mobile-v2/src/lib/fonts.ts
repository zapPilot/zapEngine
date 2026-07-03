/**
 * Runtime-loaded brand fonts. RN cannot weight-match runtime fonts, so every
 * weight registers under its own family name; tailwind.config.js mirrors these
 * names as the font-sans-… and font-mono-… utilities.
 */
export const APP_FONTS = {
  InstrumentSerif: require('../../assets/fonts/InstrumentSerif-Regular.ttf'),
  Geist: require('../../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../../assets/fonts/Geist-Bold.ttf'),
  JetBrainsMono: require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  'JetBrainsMono-Medium': require('../../assets/fonts/JetBrainsMono-Medium.ttf'),
  'JetBrainsMono-SemiBold': require('../../assets/fonts/JetBrainsMono-SemiBold.ttf'),
  'JetBrainsMono-Bold': require('../../assets/fonts/JetBrainsMono-Bold.ttf'),
} as const;
