import { FORM as ja } from './ja/form';
import { FORM as en } from './en/form';
import { FORM as zh } from './zh-Hant/form';
import { localeFromLang } from './locales';
export function formForPage() {
  return { ja, en, 'zh-Hant': zh }[
    localeFromLang(document.documentElement.lang)
  ];
}
