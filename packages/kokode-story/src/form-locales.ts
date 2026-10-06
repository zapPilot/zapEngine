import { FORM as ja } from './ja/form.js';
import { FORM as en } from './en/form.js';
import { FORM as zh } from './zh-Hant/form.js';
import { localeFromLang } from './locales.js';
export function formForPage(lang: string) {
  return { ja, en, 'zh-Hant': zh }[localeFromLang(lang)];
}
