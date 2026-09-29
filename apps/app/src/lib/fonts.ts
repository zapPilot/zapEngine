/**
 * Runtime-loaded brand fonts. RN cannot weight-match runtime fonts, so every
 * weight registers under its own family name; tailwind.config.js mirrors these
 * names as the font-sans-… and font-mono-… utilities.
 */
import GeistBold from '../../assets/fonts/Geist-Bold.ttf';
import GeistMedium from '../../assets/fonts/Geist-Medium.ttf';
import GeistRegular from '../../assets/fonts/Geist-Regular.ttf';
import GeistSemiBold from '../../assets/fonts/Geist-SemiBold.ttf';
import InstrumentSerifRegular from '../../assets/fonts/InstrumentSerif-Regular.ttf';
import JetBrainsMonoBold from '../../assets/fonts/JetBrainsMono-Bold.ttf';
import JetBrainsMonoMedium from '../../assets/fonts/JetBrainsMono-Medium.ttf';
import JetBrainsMonoRegular from '../../assets/fonts/JetBrainsMono-Regular.ttf';
import JetBrainsMonoSemiBold from '../../assets/fonts/JetBrainsMono-SemiBold.ttf';

export const APP_FONTS = {
  InstrumentSerif: InstrumentSerifRegular,
  Geist: GeistRegular,
  'Geist-Medium': GeistMedium,
  'Geist-SemiBold': GeistSemiBold,
  'Geist-Bold': GeistBold,
  JetBrainsMono: JetBrainsMonoRegular,
  'JetBrainsMono-Medium': JetBrainsMonoMedium,
  'JetBrainsMono-SemiBold': JetBrainsMonoSemiBold,
  'JetBrainsMono-Bold': JetBrainsMonoBold,
} as const;
