import * as jaBeats from './ja/beats';
import * as jaDemos from './ja/demos';
import * as jaNotes from './ja/disclaimers';
import * as jaFigures from './ja/figures';
import * as jaForm from './ja/form';
import * as jaSite from './ja/site';
import * as enBeats from './en/beats';
import * as enDemos from './en/demos';
import * as enNotes from './en/disclaimers';
import * as enFigures from './en/figures';
import * as enForm from './en/form';
import * as enSite from './en/site';
import * as zhBeats from './zh-Hant/beats';
import * as zhDemos from './zh-Hant/demos';
import * as zhNotes from './zh-Hant/disclaimers';
import * as zhFigures from './zh-Hant/figures';
import * as zhForm from './zh-Hant/form';
import * as zhSite from './zh-Hant/site';
import type { Locale } from './locales';
import type { CopyShape } from './types';
const ja = {
  ...jaBeats,
  ...jaDemos,
  ...jaNotes,
  ...jaFigures,
  ...jaForm,
  ...jaSite,
};
export type Story = Omit<
  CopyShape<typeof ja>,
  'BEATS' | 'DEMOS' | 'DEMO_FIGURES' | 'INTEREST'
> &
  Pick<typeof ja, 'BEATS' | 'DEMOS' | 'DEMO_FIGURES'> & {
    readonly INTEREST: readonly {
      readonly id: import('./types').InterestId;
      readonly label: string;
    }[];
  } & { readonly locale: Locale; readonly footnote: typeof jaNotes.footnote };
const stories: Record<Locale, Story> = {
  ja: { ...ja, locale: 'ja' },
  en: {
    ...enBeats,
    ...enDemos,
    ...enNotes,
    ...enFigures,
    ...enForm,
    ...enSite,
    locale: 'en',
  },
  'zh-Hant': {
    ...zhBeats,
    ...zhDemos,
    ...zhNotes,
    ...zhFigures,
    ...zhForm,
    ...zhSite,
    locale: 'zh-Hant',
  },
};
export function storyFor(locale: Locale): Story {
  return stories[locale];
}
