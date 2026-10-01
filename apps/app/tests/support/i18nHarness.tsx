import { TRANSLATIONS } from '@/i18n/translations';
import { createTranslator } from '@/lib/i18n';
export const en = createTranslator(TRANSLATIONS.en);
export const zhHant = createTranslator(TRANSLATIONS['zh-Hant']);
