// Load font data and files only for the selected language.
import type { CaptionLang } from '../../timeline/types';

export async function fontFor(lang: CaptionLang): Promise<string> {
  if (lang === 'ja') {
    const { loadVariableFont } =
      await import('@remotion/google-fonts/NotoSansJP');
    return loadVariableFont('normal', {
      subsets: ['japanese', 'latin'],
      ignoreTooManyRequestsWarning: true,
    }).fontFamily;
  }
  if (lang === 'zh-Hant') {
    const { loadVariableFont } =
      await import('@remotion/google-fonts/NotoSansTC');
    return loadVariableFont('normal', {
      subsets: ['chinese-traditional', 'latin'],
      ignoreTooManyRequestsWarning: true,
    }).fontFamily;
  }
  const { loadFont } = await import('@remotion/google-fonts/Inter');
  return loadFont('normal', {
    weights: ['400', '600', '700', '800'],
    subsets: ['latin'],
  }).fontFamily;
}
