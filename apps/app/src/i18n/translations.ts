import type { ContentLanguageCode } from '@/config/contentLanguages';
import * as common from './modules/common';
import * as tabs from './modules/tabs';
import * as language from './modules/language';
import * as account from './modules/account';
import * as home from './modules/home';
import * as financialFeature from './modules/financialFeature';
import * as podcast from './modules/podcast';
import * as strategy from './modules/strategy';
import * as portfolio from './modules/portfolio';
import * as invest from './modules/invest';
import * as fund from './modules/fund';
import * as dock from './modules/dock';
import * as today from './modules/today';
import * as listen from './modules/listen';
import * as runtime from './modules/runtime';
import * as firstRun from './modules/firstRun';

export const en = {
  ...common.en,
  ...tabs.en,
  ...language.en,
  ...account.en,
  ...home.en,
  ...financialFeature.en,
  ...podcast.en,
  ...strategy.en,
  ...portfolio.en,
  ...invest.en,
  ...fund.en,
  ...dock.en,
  ...today.en,
  ...listen.en,
  ...runtime.en,
  ...firstRun.en,
} as const;

export const zhHant = {
  ...common.zhHant,
  ...tabs.zhHant,
  ...language.zhHant,
  ...account.zhHant,
  ...home.zhHant,
  ...financialFeature.zhHant,
  ...podcast.zhHant,
  ...strategy.zhHant,
  ...portfolio.zhHant,
  ...invest.zhHant,
  ...fund.zhHant,
  ...dock.zhHant,
  ...today.zhHant,
  ...listen.zhHant,
  ...runtime.zhHant,
  ...firstRun.zhHant,
} satisfies TranslationDictionary;

export const ja = {
  ...common.ja,
  ...tabs.ja,
  ...language.ja,
  ...account.ja,
  ...home.ja,
  ...financialFeature.ja,
  ...podcast.ja,
  ...strategy.ja,
  ...portfolio.ja,
  ...invest.ja,
  ...fund.ja,
  ...dock.ja,
  ...today.ja,
  ...listen.ja,
  ...runtime.ja,
  ...firstRun.ja,
} satisfies TranslationDictionary;

export type TranslationKey = keyof typeof en;
export type TranslationParams = Readonly<Record<string, string | number>>;
type TranslationDictionary = Record<TranslationKey, string>;
export const TRANSLATIONS: Readonly<
  Record<ContentLanguageCode, TranslationDictionary>
> = { en, 'zh-Hant': zhHant, ja };
