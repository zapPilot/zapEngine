// The landing page loads the same three families through next/font/google, so
// type renders identically in the product and in the video.
import { loadFont as loadGeist } from '@remotion/google-fonts/Geist';
import { loadFont as loadInstrumentSerif } from '@remotion/google-fonts/InstrumentSerif';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';

const sans = loadGeist('normal', {
  weights: ['400', '500', '600'],
  subsets: ['latin'],
});
const serif = loadInstrumentSerif('normal', {
  weights: ['400'],
  subsets: ['latin'],
});
loadInstrumentSerif('italic', { weights: ['400'], subsets: ['latin'] });
const mono = loadJetBrainsMono('normal', {
  weights: ['400', '500'],
  subsets: ['latin'],
});

/** Display: Instrument Serif. Interface and captions: Geist. Hex: JetBrains Mono. */
export const font = {
  serif: serif.fontFamily,
  sans: sans.fontFamily,
  mono: mono.fontFamily,
} as const;
