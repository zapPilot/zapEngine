// Only the lazily loaded kokode-clinic composition imports this, so rendering
// another video never fetches the Japanese font (about 120 subset files).
import { loadVariableFont } from '@remotion/google-fonts/NotoSansJP';

const noto = loadVariableFont('normal', {
  subsets: ['japanese', 'latin'],
  ignoreTooManyRequestsWarning: true,
});

/** Noto Sans JP, every weight from 100 to 900. */
export const jaFont = noto.fontFamily;
