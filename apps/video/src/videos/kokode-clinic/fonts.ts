// Load font data and files only for the selected language.
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';

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

/** The selected language's font family; rendering waits until it loads. */
export function useLangFont(lang: CaptionLang): string {
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [handle] = useState(() => delayRender('Load caption font'));
  useEffect(() => {
    const load = async () => {
      try {
        setFontFamily(await fontFor(lang));
        continueRender(handle);
      } catch (error) {
        cancelRender(error);
      }
    };
    void load();
  }, [lang, handle]);
  return fontFamily;
}
